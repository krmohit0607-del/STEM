import type { Voyage } from '../../data/voyages';
import type { EngineSpeedConsRow, LegRow, SpeedConsRow, VoyageView } from './types';

/** Deterministic, per-vessel test data for the Voyage Details form.
 *  These builders stand in for an API response and can be swapped later. */

/** Canonical display order for leg types. */
const LEG_TYPE_ORDER = ['Delivery', 'Ballast', 'Laden', 'Redelivery'];

/** Sort index for a leg type — unknown types sit just before Redelivery. */
function legTypeOrder(type: string): number {
  const i = LEG_TYPE_ORDER.indexOf(type);
  return i === -1 ? LEG_TYPE_ORDER.length - 1.5 : i;
}

/**
 * Re-order legs (Delivery → Ballast → Laden → Redelivery), then re-number and
 * enforce port chaining:
 *  - each leg's `from` = previous leg's `to`
 *  - each sub-leg's `from` = previous sub-leg's `to` (first one = leg `from`)
 *  - when a leg has sub-legs, its `to` = last sub-leg's `to`
 */
export function normalizeLegs(legs: LegRow[]): LegRow[] {
  let prevTo = '';
  return legs
    .map((leg, idx) => ({ leg, idx }))
    .sort((a, b) => legTypeOrder(a.leg.type) - legTypeOrder(b.leg.type) || a.idx - b.idx)
    .map(({ leg }, idx) => {
      const from = idx === 0 ? leg.from : prevTo;
      let subPrev = from;
      const subLegs = leg.subLegs.map((s) => {
        const next = { ...s, from: subPrev };
        subPrev = s.to;
        return next;
      });
      const to = subLegs.length ? subLegs[subLegs.length - 1].to : leg.to;
      prevTo = to;
      return { ...leg, no: `LEG-${idx + 1}`, from, to, subLegs };
    });
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Current date/time as "DD-Mon-YYYY HH:MM UTC" (matches the audit-log style). */
export function nowStamp(): string {
  const d = new Date();
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()];
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}-${mon}-${d.getUTCFullYear()} ${hour}:${min} UTC`;
}

/** Mulberry32 deterministic PRNG seeded by an integer. */
function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

function numFmt(n: number): string {
  return Math.round(n).toLocaleString();
}

/** Strip a trailing unit (e.g. "180,000 MT" -> 180000). */
function toNumber(value: string): number {
  const m = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/** Default Speed & Cons rows shown for every leg (ECO / FULL / CUSTOM). */
export function emptySpeedCons(): SpeedConsRow[] {
  return ['ECO', 'FULL', 'CUSTOM'].map((description) => ({
    description,
    speed: '',
    fuelType1: 'VLSFO',
    dailyCons1: '',
    fuelType2: 'LSMGO',
    dailyCons2: '',
    fuelType3: '',
    dailyCons3: '',
  }));
}

/** Default vessel-level Speed & Cons profile rows (per load condition). */
export function emptyEngineSpeedCons(): EngineSpeedConsRow[] {
  return ['Ballast', 'Laden'].map((condition) => ({
    condition,
    speed: '',
    consME: '',
    consAE: '',
    rpm: '',
    mcrPercent: '',
    powerKw: '',
    eplLimit: '',
  }));
}

/** A blank, fully-editable leg. */
export function emptyLeg(no: string): LegRow {  return {
    no,
    name: '',
    type: '',
    from: '',
    to: '',
    etd: '',
    status: 'Planning',
    etdLocalTime: true,
    autoRoute: true,
    distanceNm: '',
    draft: '',
    displacement: '',
    gm: '',
    rollPeriod: '',
    subLegs: [],
    maxSwh: '',
    maxWind: '',
    maxSeaState: '',
    cpWinds: '',
    cpDss: '',
    cpSwh: '',
    cpMinHours: '',
    cpCurrents: '',
    cpAllowableFuelMethod: '',
    cpGoodWeatherSelection: '',
    cpAboutSpeed: '',
    cpTimeGain: '',
    cpTimeLoss: '',
    speedCons: emptySpeedCons(),
  };
}

export function buildEmptyView(): VoyageView {
  return {
    vesselName: '',
    imo: '',
    client: '',
    serviceType: '',
    pic: '',
    status: '',
    duration: '',
    createdOn: '',
    lastUpdated: '',

    clientType: '',
    emissionReportRequired: false,
    pricingBasis: '',
    price: '',
    clientEmailList: '',
    dailyFleetSummaryEmail: '',
    clientNotes: '',

    vesselType: '',
    flag: '',
    vesselEmail: '',
    ecdisModel: '',
    autoSendForecast: false,
    autoSendForecastTime: '',
    weather4x: false,
    weather4xDuration: '',
    autoSendReports: false,

    minRpm: '',
    maxRpm: '',
    minMcr: '',
    maxMcr: '',
    minSpeed: '',
    maxSpeed: '',
    minPowerFraction: '',
    maxPowerFraction: '',
    nominalPowerFraction: '',
    blowerBallastMin: '',
    blowerBallastMax: '',
    blowerLadenMin: '',
    blowerLadenMax: '',
    criticalRpmMin: '',
    criticalRpmMax: '',
    scrubber: false,
    scrubberType: '',

    deadSlowRpm: '',
    slowAheadRpm: '',
    halfAheadRpm: '',
    fullAheadRpm: '',

    meType: '',
    meModel: '',
    loa: '',
    beam: '',
    defaultBallastDraft: '',
    defaultLadenDraft: '',
    summerDraft: '',
    summerDisplacement: '',
    summerDeadweight: '',

    engineSpeedCons: emptyEngineSpeedCons(),

    wslMaxSwhBallast: '',
    wslMaxSwhLaden: '',
    wslMaxWindsBallast: '',
    wslMaxWindsLaden: '',
    wslMaxSeaStateBallast: '',
    wslMaxSeaStateLaden: '',

    optMode: '',
    optObjective: '',
    optTargetEta: '',
    optTargetSpeed: '',
    optMinSpeed: '',
    optMaxSpeed: '',
    optWeatherRouting: false,
    optAvoidEca: false,
    optFuelPriceVlsfo: '',
    optFuelPriceLsmgo: '',
    optCiiTarget: '',

    operationalNotes: '',
    masterRemarks: '',
    internalNotes: '',

    changeHistory: [
      {
        user: 'You',
        timestamp: nowStamp(),
        change: 'Voyage created.',
        before: '—',
        after: 'New voyage',
      },
    ],

    legs: [emptyLeg('LEG-1')],
  };
}

/** Build a full, per-vessel dynamic view from the selected voyage. */
export function buildView(v: Voyage): VoyageView {
  const rng = makeRng(v.seed * 101 + v.imo.length);
  const r: number[] = Array.from({ length: 32 }, () => rng());

  const dwtNum = toNumber(v.dwt);
  const summerDisp = Math.round(dwtNum * (1.12 + r[7] * 0.06));
  const ladenDraft = 14 + r[4] * 7;
  const ballastDraft = ladenDraft * (0.45 + r[5] * 0.05);
  const gm = (3.6 + r[8] * 1.4).toFixed(1);
  const roll = (9 + r[9] * 4).toFixed(1);
  const ecoSpeed = v.cpSpeed;
  const ecoCons = v.cpCons;
  const fullSpeed = v.cpSpeed + 1.5 + r[10];
  const fullCons = v.cpCons + 5 + r[11] * 3;
  const customSpeed = v.instSpeed;
  const customCons = v.instCons;
  const durationDays = (38 + r[16] * 52).toFixed(1);
  const createdDay = String(1 + Math.floor(r[17] * 27)).padStart(2, '0');
  const createdMon = pick(MONTHS, r[18]);
  const updatedHour = String(Math.floor(r[19] * 24)).padStart(2, '0');
  const updatedMin = String(Math.floor(r[20] * 60)).padStart(2, '0');
  const interim = v.interimPort || v.portTo;

  // Engine & limits (deterministic, derived from the seeded values).
  const maxRpm = Math.round(80 + r[0] * 30);
  const minRpm = Math.round(maxRpm * 0.34);
  const maxMcr = Math.round(8000 + r[1] * 12000);
  const minMcr = Math.round(maxMcr * 0.1);
  const deadSlow = Math.round(maxRpm * 0.34);
  const slowAhead = Math.round(maxRpm * 0.46);
  const halfAhead = Math.round(maxRpm * 0.58);
  const fullAhead = Math.round(maxRpm * 0.74);
  const summerDraftVal = ladenDraft + 0.3 + r[6] * 0.4;
  const meModel = pick(['MAN B&W 6S70ME-C', 'Wartsila RT-flex68', 'MAN 6G70ME-C9', 'WinGD X72'], r[2]);

  const mcrSteps = [30, 45, 60, 75, 90, 105];
  const mkEngineRows = (condition: string, baseSpeed: number, consBase: number): EngineSpeedConsRow[] =>
    mcrSteps.map((mcr, idx) => ({
      condition,
      speed: (baseSpeed + idx * 0.5).toFixed(1),
      consME: (consBase + idx * 2).toFixed(1),
      consAE: '2.5',
      rpm: String(Math.round(minRpm + (maxRpm - minRpm) * (mcr / 105))),
      mcrPercent: `${mcr}%`,
      powerKw: Math.round(maxMcr * (mcr / 100)).toLocaleString(),
      eplLimit: mcr <= 75 ? 'Yes' : '',
    }));

  const engineSpeedCons: EngineSpeedConsRow[] = [
    ...mkEngineRows('Ballast', ecoSpeed - 1, ecoCons - 2),
    ...mkEngineRows('Laden', ecoSpeed - 1.5, ecoCons + 1),
  ];

  const mkSpeedCons = (): SpeedConsRow[] => [
    { description: 'ECO', speed: ecoSpeed.toFixed(1), fuelType1: 'VLSFO', dailyCons1: ecoCons.toFixed(1), fuelType2: 'LSMGO', dailyCons2: '0.5', fuelType3: 'Biogas', dailyCons3: '0.1' },
    { description: 'FULL', speed: fullSpeed.toFixed(1), fuelType1: 'VLSFO', dailyCons1: fullCons.toFixed(1), fuelType2: 'LSMGO', dailyCons2: '0.5', fuelType3: 'Biogas', dailyCons3: '0.1' },
    { description: 'CUSTOM', speed: customSpeed.toFixed(1), fuelType1: 'VLSFO', dailyCons1: customCons.toFixed(1), fuelType2: 'LSMGO', dailyCons2: '0.4', fuelType3: '', dailyCons3: '' },
  ];

  const mkLeg = (
    no: string,
    type: string,
    from: string,
    to: string,
    etd: string,
    status: string,
    draft: string,
    displacement: string,
    swh: string,
    wind: string,
    sea: string,
    distanceNm: string,
  ): LegRow => ({
    no,
    name: `${from} → ${to}`,
    type,
    from,
    to,
    etd,
    status,
    etdLocalTime: true,
    autoRoute: true,
    distanceNm,
    draft,
    displacement,
    gm,
    rollPeriod: roll,
    subLegs: [],
    maxSwh: swh,
    maxWind: wind,
    maxSeaState: sea,
    cpWinds: 'BF 5',
    cpDss: '4',
    cpSwh: '2.5',
    cpMinHours: '12',
    cpCurrents: '0.5 kn',
    cpAllowableFuelMethod: 'VLSFO',
    cpGoodWeatherSelection: 'Noon-to-Noon',
    cpAboutSpeed: `${ecoSpeed.toFixed(1)} kn`,
    cpTimeGain: '0.0 h',
    cpTimeLoss: '0.0 h',
    speedCons: mkSpeedCons(),
  });

  const addDays = (etd: string, n: number): string => {
    const d = new Date(etd.replace(',', ''));
    if (isNaN(d.getTime())) return etd;
    d.setDate(d.getDate() + n);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleString('en-US', { month: 'short' });
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${mon} ${d.getFullYear()}, ${hh}:${mm}`;
  };

  const ladenDisp = numFmt(summerDisp * 0.92);
  const ballastDisp = numFmt(summerDisp * 0.46);

  const legDist = (idx: number) =>
    `${Math.round(1500 + r[21 + idx] * 4200).toLocaleString()} NM`;

  const legs: LegRow[] = [
    mkLeg('LEG-1', 'Delivery', v.portFrom, interim, v.etdDisplay, 'Complete', ballastDraft.toFixed(1), ballastDisp, '4', '7', '5', legDist(0)),
    mkLeg('LEG-2', 'Laden', interim, v.portTo, addDays(v.etdDisplay, 4), 'Active', ladenDraft.toFixed(1), ladenDisp, '4.5', '7', '5', legDist(1)),
    mkLeg('LEG-3', 'Ballast', v.portTo, 'Singapore (SGSIN)', addDays(v.etdDisplay, 11), 'Planning', ballastDraft.toFixed(1), ballastDisp, '5', '8', '6', legDist(2)),
    mkLeg('LEG-4', 'Redelivery', 'Singapore (SGSIN)', v.portFrom, addDays(v.etdDisplay, 18), 'Planning', ladenDraft.toFixed(1), ladenDisp, '4', '7', '5', legDist(3)),
  ];

  // Seed LEG-2 with an intermediate port to demonstrate sub-legs.
  legs[1].subLegs = [
    { type: 'Laden', from: interim, to: 'Port Said (EGPSD)', etd: addDays(v.etdDisplay, 4), autoRoute: true, cpWinds: 'BF 5', cpDss: '4', cpSwh: '2.5', cpMinHours: '12', cpCurrents: '0.5 kn', cpGoodWeatherSelection: 'Noon-to-Noon' },
    { type: 'Laden', from: 'Port Said (EGPSD)', to: v.portTo, etd: addDays(v.etdDisplay, 8), autoRoute: true, cpWinds: 'BF 5', cpDss: '4', cpSwh: '2.5', cpMinHours: '12', cpCurrents: '0.5 kn', cpGoodWeatherSelection: 'Noon-to-Noon' },
  ];

  return {
    vesselName: v.vessel,
    imo: v.imo,
    client: v.client,
    serviceType: v.service,
    pic: v.pic,
    status: v.status,
    duration: `${durationDays} days`,
    createdOn: `${createdDay}-${createdMon}-2025`,
    lastUpdated: `${createdDay}-${createdMon}-2025 ${updatedHour}:${updatedMin} UTC`,

    clientType: r[27] > 0.5 ? 'Owner' : 'Charter',
    emissionReportRequired: r[28] > 0.5,
    pricingBasis: v.pricingBasis,
    price: `${v.price.toLocaleString()} USD`,
    clientEmailList: v.clientEmail,
    dailyFleetSummaryEmail: `reports@${v.clientEmail.split('@')[1] ?? 'client.example.com'}`,
    clientNotes:
      v.handoverNote ||
      'Master to send daily noon report by 12:30 LT. Use ECO speed unless instructed otherwise.',

    vesselType: v.vesselType,
    flag: v.flag,
    vesselEmail: `master.${v.id.toLowerCase()}@vessel.example.com`,
    ecdisModel: v.ecdisModel,
    autoSendForecast: r[20] > 0.4,
    autoSendForecastTime: pick(['06:00 UTC', '00:00 UTC', '12:00 UTC'], r[21]),
    weather4x: r[22] > 0.5,
    weather4xDuration: pick(['7 days', '10 days', '14 days'], r[23]),
    autoSendReports: r[24] > 0.4,

    minRpm: String(minRpm),
    maxRpm: String(maxRpm),
    minMcr: `${minMcr.toLocaleString()} kW`,
    maxMcr: `${maxMcr.toLocaleString()} kW`,
    minSpeed: `${(ecoSpeed - 3).toFixed(1)} kn`,
    maxSpeed: `${(fullSpeed + 1).toFixed(1)} kn`,
    minPowerFraction: '0.10',
    maxPowerFraction: '0.90',
    nominalPowerFraction: '0.75',
    blowerBallastMin: String(Math.round(maxRpm * 0.30)),
    blowerBallastMax: String(Math.round(maxRpm * 0.45)),
    blowerLadenMin: String(Math.round(maxRpm * 0.33)),
    blowerLadenMax: String(Math.round(maxRpm * 0.48)),
    criticalRpmMin: String(Math.round(maxRpm * 0.50)),
    criticalRpmMax: String(Math.round(maxRpm * 0.56)),
    scrubber: r[25] > 0.5,
    scrubberType: r[26] > 0.5 ? 'Open Loop' : 'Closed Loop',

    deadSlowRpm: String(deadSlow),
    slowAheadRpm: String(slowAhead),
    halfAheadRpm: String(halfAhead),
    fullAheadRpm: String(fullAhead),

    meType: r[29] > 0.5 ? '2-Stroke' : '4-Stroke',
    meModel,
    loa: v.loa,
    beam: v.beam,
    defaultBallastDraft: `${ballastDraft.toFixed(1)} m`,
    defaultLadenDraft: `${ladenDraft.toFixed(1)} m`,
    summerDraft: `${summerDraftVal.toFixed(1)} m`,
    summerDisplacement: `${numFmt(summerDisp)} MT`,
    summerDeadweight: v.dwt,

    engineSpeedCons,

    wslMaxSwhBallast: '4',
    wslMaxSwhLaden: '5',
    wslMaxWindsBallast: '7',
    wslMaxWindsLaden: '6',
    wslMaxSeaStateBallast: '5',
    wslMaxSeaStateLaden: '6',

    optMode: 'Min Fuel',
    optObjective: 'Minimise bunker consumption while meeting laycan',
    optTargetEta: addDays(v.etdDisplay, Math.round(Number(durationDays))),
    optTargetSpeed: `${ecoSpeed.toFixed(1)} kn`,
    optMinSpeed: `${(ecoSpeed - 2).toFixed(1)} kn`,
    optMaxSpeed: `${fullSpeed.toFixed(1)} kn`,
    optWeatherRouting: true,
    optAvoidEca: r[30] > 0.5,
    optFuelPriceVlsfo: '585 USD/MT',
    optFuelPriceLsmgo: '780 USD/MT',
    optCiiTarget: pick(['A', 'B', 'C'], r[31]),

    operationalNotes:
      'Maintain ECO speed; report any deviation > 0.5 kn from plan. Keep within CP good-weather limits.',
    masterRemarks: 'Heavy swell expected mid-passage; monitor lashings and adjust speed as needed.',
    internalNotes: 'Client prefers daily noon reports by 12:30 LT. Optimisation reviewed by ops desk.',

    changeHistory: [
      {
        user: 'Ops Desk',
        timestamp: `${createdDay}-${createdMon}-2025 09:05 UTC`,
        change: 'Voyage created.',
        before: '—',
        after: `${v.portFrom} → ${v.portTo}`,
      },
      {
        user: v.pic || 'Ops Desk',
        timestamp: `${createdDay}-${createdMon}-2025 10:42 UTC`,
        change: 'Vessel profile and CP terms confirmed.',
        before: 'Draft',
        after: 'Confirmed',
      },
      {
        user: 'Chartering',
        timestamp: `${createdDay}-${createdMon}-2025 13:18 UTC`,
        change: 'Added intermediate port to LEG-2 (Port Said).',
        before: 'No interim port',
        after: 'Port Said (EGPSD)',
      },
      {
        user: v.pic || 'Ops Desk',
        timestamp: `${createdDay}-${createdMon}-2025 ${updatedHour}:${updatedMin} UTC`,
        change: 'Updated weather safety limits and leg ETDs.',
        before: 'Max SWH 4.0 m',
        after: 'Max SWH 5.0 m',
      },
    ],

    legs: normalizeLegs(legs),
  };
}
