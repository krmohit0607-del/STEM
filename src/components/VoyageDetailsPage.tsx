import { useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';

/**
 * Voyage Details page — `/voyage`.
 *
 * Static stub matching the legacy "Voyage Details" form layout
 * (Order Details + Vessel Details + Operating Limits + Telegraph Table
 *  + per-leg Voyage Details with CP details, Speed & Cons, Market
 *  Factors).
 *
 * Only display + a few interactive bits (collapsible legs, scope tabs,
 * save/add-leg buttons) are wired. Validation, persistence, dialogs,
 * and the actual API calls are not ported yet — replace the stub data
 * below with the appropriate endpoints when the React app exposes them.
 */

type ServiceType =
  | 'RPM'
  | 'PMO'
  | 'Weather Only'
  | 'WP Only Guidance'
  | 'Optimization'
  | 'Shadow'
  | 'Monitoring';

type ClientType = 'Owner' | 'Charter';

type PricingBasis = 'Per Day' | 'Per Voyage' | 'Per Month' | 'As Agreed';

type VesselType =
  | 'Bulk Carrier'
  | 'Oil / Chemical'
  | 'Tanker'
  | 'Container'
  | 'RO-RO'
  | 'Passenger'
  | 'Navy'
  | 'Tug';

type LegType = 'Delivery' | 'Ballast' | 'Laden' | 'Redelivery';

type FuelType = 'VLSFO' | 'HSFO' | 'MGO' | 'LNG' | 'BIOFUEL';

interface OrderDetails {
  serviceType: ServiceType;
  clientName: string;
  clientType: ClientType;
  price: number;
  pricingBasis: PricingBasis;
  clientEmailList: string;
  dailyFleetSummary: string;
  sameAsClientEmail: boolean;
  clientNotes: string;
}

interface VesselDetails {
  name: string;
  imo: string;
  type: VesselType;
  email: string;
  ecdisModel: string;
}

interface OperatingLimits {
  minRpm: number;
  maxRpm: number;
  minMcr: number;
  maxMcr: number;
  minSpeed: number;
  maxSpeed: number;
  minPowerFraction: number;
  maxPowerFraction: number;
  nominalPowerFraction: number;
  blowerOnOffMin: number;
  blowerOnOffMax: number;
  ballast: { minSwh: number; maxSwh: number; maxWind: number; maxSea: number };
  laden: { minSwh: number; maxSwh: number; maxWind: number; maxSea: number };
  criticalRpmMin: number;
  criticalRpmMax: number;
  scrubber: 'Yes' | 'No';
  egcs: 'Open' | 'Closed' | 'Loop';
  safety: { maxSwhMt: number; maxWindSpeed: number };
}

interface TelegraphRow {
  label: string;
  rpm: number;
}

interface MeDetails {
  type: string;
  mode: string;
  beams: number;
  draftBallast: number;
  draftLaden: number;
  summerDraft: number;
  summerDisplacement: number;
  seaTrimHeight: number;
}

interface SpeedConsRow {
  description: string;
  speed: number;
  fuelType: FuelType;
  isEca: boolean;
  dailyCons: number;
  /** Optional second fuel column (DO / Pilot fuel). */
  altFuelType?: FuelType;
  altDailyCons?: number;
  /** Optional third fuel column (Bio / LNG). */
  thirdFuelType?: FuelType;
  thirdDailyCons?: number;
}

interface CpDetails {
  windsBf: number;
  dssCode: number;
  swh: number;
  minHours: number;
  currents: string;
  allowableFuelMethod: string;
  aboutSpeed: string;
  timeGain: string;
  timeLoss: string;
  selection: string;
}

interface MarketFactors {
  dailyHireRate: number;
  foCost: number;
  doCost: number;
  euaCost: number;
}

interface LegData {
  id: string;
  legNumber: number;
  legType: LegType;
  portFrom: string;
  portTo: string;
  etd: string;
  autoRoute: boolean;
  draft: number;
  displacement: number;
  gm: number;
  rollPeriod: number;
  maxSwh: number;
  maxWindSpeed: number;
  cpDetails: CpDetails;
  speedCons: SpeedConsRow[];
  marketFactors: MarketFactors;
  /** Whether this leg copies CP details from previous leg. */
  cpSameAsPrevious: boolean;
}

const SERVICE_TYPES: ServiceType[] = [
  'RPM',
  'PMO',
  'Weather Only',
  'WP Only Guidance',
  'Optimization',
  'Shadow',
  'Monitoring',
];

const PRICING_BASES: PricingBasis[] = ['Per Day', 'Per Voyage', 'Per Month', 'As Agreed'];

const VESSEL_TYPES: VesselType[] = [
  'Bulk Carrier',
  'Oil / Chemical',
  'Tanker',
  'Container',
  'RO-RO',
  'Passenger',
  'Navy',
  'Tug',
];

const FUEL_TYPES: FuelType[] = ['VLSFO', 'HSFO', 'MGO', 'LNG', 'BIOFUEL'];

const LEG_TYPES: LegType[] = ['Delivery', 'Ballast', 'Laden', 'Redelivery'];

const STUB_ORDER: OrderDetails = {
  serviceType: 'RPM',
  clientName: 'Oceanic Shipping Co.',
  clientType: 'Charter',
  price: 4500,
  pricingBasis: 'Per Day',
  clientEmailList: 'ops@oceanic.example.com; chartering@oceanic.example.com',
  dailyFleetSummary: 'reports@oceanic.example.com',
  sameAsClientEmail: false,
  clientNotes:
    'Master to send daily noon report by 12:30 LT. Use ECO speed unless instructed otherwise. ECA bunker switch on arrival/departure of US/EU ports.',
};

const STUB_VESSEL: VesselDetails = {
  name: 'MV FleetView Demo',
  imo: '9876543',
  type: 'Bulk Carrier',
  email: 'master.demo@vessel.example.com',
  ecdisModel: 'JRC JAN-9201',
};

const STUB_LIMITS: OperatingLimits = {
  minRpm: 30,
  maxRpm: 78,
  minMcr: 25,
  maxMcr: 90,
  minSpeed: 9.5,
  maxSpeed: 14.0,
  minPowerFraction: 0.25,
  maxPowerFraction: 0.9,
  nominalPowerFraction: 0.75,
  blowerOnOffMin: 42,
  blowerOnOffMax: 56,
  ballast: { minSwh: 0, maxSwh: 4.0, maxWind: 7, maxSea: 5 },
  laden: { minSwh: 0, maxSwh: 3.5, maxWind: 6, maxSea: 4 },
  criticalRpmMin: 36,
  criticalRpmMax: 40,
  scrubber: 'Yes',
  egcs: 'Closed',
  safety: { maxSwhMt: 6.0, maxWindSpeed: 9 },
};

const STUB_TELEGRAPH: TelegraphRow[] = [
  { label: 'Beam Anchor RPM', rpm: 22 },
  { label: 'Slow Ahead RPM', rpm: 36 },
  { label: 'Half Ahead RPM', rpm: 56 },
  { label: 'Full Ahead RPM', rpm: 76 },
];

const STUB_ME: MeDetails = {
  type: 'MAN B&W 6S60ME-C8.2',
  mode: 'Tier II',
  beams: 45,
  draftBallast: 8.4,
  draftLaden: 18.2,
  summerDraft: 18.5,
  summerDisplacement: 209_640,
  seaTrimHeight: 2.4,
};

const DEFAULT_SPEED_CONS: SpeedConsRow[] = [
  {
    description: 'ECO',
    speed: 12,
    fuelType: 'VLSFO',
    isEca: false,
    dailyCons: 26,
    altFuelType: 'MGO',
    altDailyCons: 0.3,
    thirdFuelType: 'BIOFUEL',
    thirdDailyCons: 0.1,
  },
  {
    description: 'FULL',
    speed: 14,
    fuelType: 'VLSFO',
    isEca: false,
    dailyCons: 32,
    altFuelType: 'MGO',
    altDailyCons: 0.3,
    thirdFuelType: 'BIOFUEL',
    thirdDailyCons: 0.1,
  },
  {
    description: 'CUSTOM',
    speed: 13,
    fuelType: 'VLSFO',
    isEca: true,
    dailyCons: 28.5,
  },
];

const STUB_LEGS: LegData[] = [
  {
    id: 'leg-1',
    legNumber: 1,
    legType: 'Delivery',
    portFrom: 'Singapore',
    portTo: 'Santos',
    etd: '2026-06-14T04:50',
    autoRoute: true,
    draft: 8.4,
    displacement: 95_400,
    gm: 4.2,
    rollPeriod: 10.5,
    maxSwh: 4.0,
    maxWindSpeed: 7,
    cpDetails: {
      windsBf: 4,
      dssCode: 3,
      swh: 2.5,
      minHours: 12,
      currents: 'Adverse ≤ 0.5 kt',
      allowableFuelMethod: 'CP Daily Cap',
      aboutSpeed: '± 0.5 kt',
      timeGain: 'Pro-rate to next leg',
      timeLoss: 'Charterers account if WX > BF 4',
      selection: 'Optimization',
    },
    speedCons: DEFAULT_SPEED_CONS,
    marketFactors: {
      dailyHireRate: 18_500,
      foCost: 765,
      doCost: 1120,
      euaCost: 74.5,
    },
    cpSameAsPrevious: false,
  },
  {
    id: 'leg-2',
    legNumber: 2,
    legType: 'Ballast',
    portFrom: 'Santos',
    portTo: 'Singapore',
    etd: '2026-07-04T08:00',
    autoRoute: true,
    draft: 8.4,
    displacement: 95_400,
    gm: 4.4,
    rollPeriod: 10.2,
    maxSwh: 4.0,
    maxWindSpeed: 7,
    cpDetails: {
      windsBf: 4,
      dssCode: 3,
      swh: 2.5,
      minHours: 12,
      currents: 'Adverse ≤ 0.5 kt',
      allowableFuelMethod: 'CP Daily Cap',
      aboutSpeed: '± 0.5 kt',
      timeGain: 'Pro-rate to next leg',
      timeLoss: 'Charterers account if WX > BF 4',
      selection: 'Optimization',
    },
    speedCons: DEFAULT_SPEED_CONS,
    marketFactors: {
      dailyHireRate: 18_500,
      foCost: 765,
      doCost: 1120,
      euaCost: 74.5,
    },
    cpSameAsPrevious: true,
  },
  {
    id: 'leg-3',
    legNumber: 3,
    legType: 'Laden',
    portFrom: 'Santos',
    portTo: 'Qingdao',
    etd: '2026-07-25T12:00',
    autoRoute: true,
    draft: 18.2,
    displacement: 209_640,
    gm: 5.1,
    rollPeriod: 11.1,
    maxSwh: 3.5,
    maxWindSpeed: 6,
    cpDetails: {
      windsBf: 4,
      dssCode: 3,
      swh: 2.5,
      minHours: 12,
      currents: 'Adverse ≤ 0.5 kt',
      allowableFuelMethod: 'CP Daily Cap',
      aboutSpeed: '± 0.5 kt',
      timeGain: 'Pro-rate to next leg',
      timeLoss: 'Charterers account if WX > BF 4',
      selection: 'Optimization',
    },
    speedCons: DEFAULT_SPEED_CONS,
    marketFactors: {
      dailyHireRate: 18_500,
      foCost: 765,
      doCost: 1120,
      euaCost: 74.5,
    },
    cpSameAsPrevious: true,
  },
  {
    id: 'leg-4',
    legNumber: 4,
    legType: 'Redelivery',
    portFrom: 'Qingdao',
    portTo: 'Singapore',
    etd: '2026-08-29T05:30',
    autoRoute: true,
    draft: 8.4,
    displacement: 95_400,
    gm: 4.4,
    rollPeriod: 10.2,
    maxSwh: 4.0,
    maxWindSpeed: 7,
    cpDetails: {
      windsBf: 4,
      dssCode: 3,
      swh: 2.5,
      minHours: 12,
      currents: 'Adverse ≤ 0.5 kt',
      allowableFuelMethod: 'CP Daily Cap',
      aboutSpeed: '± 0.5 kt',
      timeGain: 'Pro-rate to next leg',
      timeLoss: 'Charterers account if WX > BF 4',
      selection: 'Optimization',
    },
    speedCons: DEFAULT_SPEED_CONS,
    marketFactors: {
      dailyHireRate: 18_500,
      foCost: 765,
      doCost: 1120,
      euaCost: 74.5,
    },
    cpSameAsPrevious: true,
  },
];

function formatNumber(n: number, fractionDigits = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function VoyageDetailsPage() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const [order, setOrder] = useState<OrderDetails>(STUB_ORDER);
  const [vessel, setVessel] = useState<VesselDetails>(STUB_VESSEL);
  const [limits] = useState<OperatingLimits>(STUB_LIMITS);
  const [telegraph] = useState<TelegraphRow[]>(STUB_TELEGRAPH);
  const [me] = useState<MeDetails>(STUB_ME);
  const [legs, setLegs] = useState<LegData[]>(STUB_LEGS);
  const [activeLegId, setActiveLegId] = useState<string>(STUB_LEGS[0].id);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const activeLeg = useMemo(
    () => legs.find((leg) => leg.id === activeLegId) ?? legs[0],
    [legs, activeLegId],
  );

  const totalDuration = useMemo(() => {
    const start = legs[0]?.etd ? new Date(legs[0].etd) : null;
    const end = legs[legs.length - 1]?.etd
      ? new Date(legs[legs.length - 1].etd)
      : null;
    if (!start || !end) return null;
    const ms = end.getTime() - start.getTime();
    if (ms <= 0) return null;
    const days = ms / 86_400_000;
    return `${days.toFixed(1)} days`;
  }, [legs]);

  const totalCost = useMemo(() => {
    return legs.reduce((acc, leg) => acc + leg.marketFactors.dailyHireRate, 0);
  }, [legs]);

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isCollapsed = (id: string) => !!collapsedSections[id];

  const updateLeg = <K extends keyof LegData>(legId: string, key: K, value: LegData[K]) => {
    setLegs((prev) =>
      prev.map((leg) => (leg.id === legId ? { ...leg, [key]: value } : leg)),
    );
  };

  const addLeg = () => {
    const next: LegData = {
      ...STUB_LEGS[0],
      id: `leg-${legs.length + 1}-${Date.now()}`,
      legNumber: legs.length + 1,
      legType: 'Laden',
      portFrom: '',
      portTo: '',
      etd: '',
      cpSameAsPrevious: true,
    };
    setLegs((prev) => [...prev, next]);
    setActiveLegId(next.id);
  };

  const removeLeg = (legId: string) => {
    setLegs((prev) => {
      const filtered = prev.filter((leg) => leg.id !== legId);
      const renumbered = filtered.map((leg, idx) => ({ ...leg, legNumber: idx + 1 }));
      if (renumbered.length > 0 && legId === activeLegId) {
        setActiveLegId(renumbered[0].id);
      }
      return renumbered;
    });
  };

  const splitLeg = (legId: string) => {
    setLegs((prev) => {
      const idx = prev.findIndex((leg) => leg.id === legId);
      if (idx < 0) return prev;
      const original = prev[idx];
      const copy: LegData = {
        ...original,
        id: `${original.id}-split-${Date.now()}`,
        legNumber: original.legNumber + 1,
        portFrom: original.portTo,
        portTo: '',
        cpSameAsPrevious: true,
      };
      const inserted = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      return inserted.map((leg, i) => ({ ...leg, legNumber: i + 1 }));
    });
  };

  const toggleMergeSelection = (legId: string) => {
    setSelectedForMerge((prev) =>
      prev.includes(legId) ? prev.filter((id) => id !== legId) : [...prev, legId],
    );
  };

  const mergeSelected = () => {
    if (selectedForMerge.length < 2) return;
    setLegs((prev) => {
      const sorted = [...prev].sort((a, b) => a.legNumber - b.legNumber);
      const toMerge = sorted.filter((leg) => selectedForMerge.includes(leg.id));
      const others = sorted.filter((leg) => !selectedForMerge.includes(leg.id));
      const merged: LegData = {
        ...toMerge[0],
        portTo: toMerge[toMerge.length - 1].portTo,
        cpSameAsPrevious: false,
      };
      const next = [merged, ...others].sort((a, b) => a.legNumber - b.legNumber);
      return next.map((leg, i) => ({ ...leg, legNumber: i + 1 }));
    });
    setSelectedForMerge([]);
  };

  const handleSave = () => {
    setSavedAt(new Date().toLocaleTimeString());
  };

  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div>
          <h1>{t('voyageDetails', 'Voyage Details')}</h1>
          <p className="fv-voyage__sub">
            {vessel.name} · IMO {vessel.imo} · {legs.length} leg{legs.length === 1 ? '' : 's'}
            {totalDuration ? ` · ${totalDuration}` : ''}
            {totalCost ? ` · Total daily hire ${formatNumber(totalCost, 0)}` : ''}
          </p>
        </div>
        <div className="fv-voyage__header-actions">
          {savedAt && (
            <span className="fv-voyage__saved-tag">Saved at {savedAt}</span>
          )}
          <button type="button" className="fv-voyage__btn" onClick={addLeg}>
            <i className="fas fa-plus" aria-hidden="true" /> Add new leg
          </button>
          <button
            type="button"
            className="fv-voyage__btn"
            onClick={mergeSelected}
            disabled={selectedForMerge.length < 2}
            title={
              selectedForMerge.length < 2
                ? 'Select at least 2 legs to merge'
                : 'Merge selected legs'
            }
          >
            <i className="fas fa-compress-arrows-alt" aria-hidden="true" /> Merge
          </button>
          <button
            type="button"
            className="fv-voyage__btn"
            onClick={() => splitLeg(activeLegId)}
          >
            <i className="fas fa-code-branch" aria-hidden="true" /> Split
          </button>
          <button
            type="button"
            className="fv-voyage__btn fv-voyage__btn--primary"
            onClick={handleSave}
          >
            <i className="fas fa-save" aria-hidden="true" /> Save
          </button>
        </div>
      </header>

      {/* ORDER DETAILS ----------------------------------------------- */}
      <Section
        id="order"
        title="Order Details"
        collapsed={isCollapsed('order')}
        onToggle={() => toggleSection('order')}
      >
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Field label="Service Type">
            <select
              value={order.serviceType}
              onChange={(e) =>
                setOrder({ ...order, serviceType: e.target.value as ServiceType })
              }
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Client Name">
            <input
              type="text"
              value={order.clientName}
              onChange={(e) => setOrder({ ...order, clientName: e.target.value })}
            />
          </Field>
          <Field label="Client Type">
            <div className="fv-voyage__radio-group">
              {(['Owner', 'Charter'] as ClientType[]).map((c) => (
                <label key={c}>
                  <input
                    type="radio"
                    name="client-type"
                    checked={order.clientType === c}
                    onChange={() => setOrder({ ...order, clientType: c })}
                  />
                  {c}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Price">
            <input
              type="number"
              min={0}
              value={order.price}
              onChange={(e) =>
                setOrder({ ...order, price: Number(e.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Pricing Basis">
            <select
              value={order.pricingBasis}
              onChange={(e) =>
                setOrder({ ...order, pricingBasis: e.target.value as PricingBasis })
              }
            >
              {PRICING_BASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Client Email List">
            <input
              type="text"
              value={order.clientEmailList}
              onChange={(e) =>
                setOrder({ ...order, clientEmailList: e.target.value })
              }
              placeholder="comma-separated emails"
            />
          </Field>
          <Field label="Daily Fleet Summary email">
            <input
              type="text"
              value={
                order.sameAsClientEmail ? order.clientEmailList : order.dailyFleetSummary
              }
              onChange={(e) =>
                setOrder({ ...order, dailyFleetSummary: e.target.value })
              }
              disabled={order.sameAsClientEmail}
              placeholder="comma-separated emails"
            />
            <label className="fv-voyage__inline-check">
              <input
                type="checkbox"
                checked={order.sameAsClientEmail}
                onChange={(e) =>
                  setOrder({ ...order, sameAsClientEmail: e.target.checked })
                }
              />
              Same as Client Email List
            </label>
          </Field>
        </div>
        <Field label="Client Notes / Instructions" full>
          <textarea
            rows={3}
            value={order.clientNotes}
            onChange={(e) => setOrder({ ...order, clientNotes: e.target.value })}
          />
        </Field>
      </Section>

      {/* VESSEL DETAILS ---------------------------------------------- */}
      <Section
        id="vessel"
        title="Vessel Details"
        collapsed={isCollapsed('vessel')}
        onToggle={() => toggleSection('vessel')}
      >
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Field label="Vessel Name">
            <input
              type="text"
              value={vessel.name}
              onChange={(e) => setVessel({ ...vessel, name: e.target.value })}
            />
          </Field>
          <Field label="IMO">
            <input
              type="text"
              value={vessel.imo}
              onChange={(e) => setVessel({ ...vessel, imo: e.target.value })}
            />
          </Field>
          <Field label="Vessel Type">
            <select
              value={vessel.type}
              onChange={(e) =>
                setVessel({ ...vessel, type: e.target.value as VesselType })
              }
            >
              {VESSEL_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vessel Email">
            <input
              type="email"
              value={vessel.email}
              onChange={(e) => setVessel({ ...vessel, email: e.target.value })}
            />
          </Field>
          <Field label="ECDIS Model">
            <input
              type="text"
              value={vessel.ecdisModel}
              onChange={(e) => setVessel({ ...vessel, ecdisModel: e.target.value })}
            />
          </Field>
        </div>
      </Section>

      {/* OPERATING LIMITS -------------------------------------------- */}
      <Section
        id="limits"
        title="Operating Limits"
        collapsed={isCollapsed('limits')}
        onToggle={() => toggleSection('limits')}
      >
        <div className="fv-voyage__limits">
          <div>
            <h4 className="fv-voyage__sub-title">Engine</h4>
            <div className="fv-voyage__grid fv-voyage__grid--2">
              <Field label="Min RPM">
                <input type="number" defaultValue={limits.minRpm} />
              </Field>
              <Field label="Max RPM">
                <input type="number" defaultValue={limits.maxRpm} />
              </Field>
              <Field label="Min MCR (%)">
                <input type="number" defaultValue={limits.minMcr} />
              </Field>
              <Field label="Max MCR (%)">
                <input type="number" defaultValue={limits.maxMcr} />
              </Field>
              <Field label="Min Speed (kt)">
                <input
                  type="number"
                  step="0.1"
                  defaultValue={limits.minSpeed}
                />
              </Field>
              <Field label="Max Speed (kt)">
                <input
                  type="number"
                  step="0.1"
                  defaultValue={limits.maxSpeed}
                />
              </Field>
              <Field label="Min Power Fraction">
                <input
                  type="number"
                  step="0.01"
                  defaultValue={limits.minPowerFraction}
                />
              </Field>
              <Field label="Max Power Fraction">
                <input
                  type="number"
                  step="0.01"
                  defaultValue={limits.maxPowerFraction}
                />
              </Field>
              <Field label="Nominal Power Fraction">
                <input
                  type="number"
                  step="0.01"
                  defaultValue={limits.nominalPowerFraction}
                />
              </Field>
              <Field label="Critical RPM Range (Min – Max)">
                <div className="fv-voyage__inline-pair">
                  <input
                    type="number"
                    defaultValue={limits.criticalRpmMin}
                    aria-label="Critical RPM Min"
                  />
                  <span>–</span>
                  <input
                    type="number"
                    defaultValue={limits.criticalRpmMax}
                    aria-label="Critical RPM Max"
                  />
                </div>
              </Field>
              <Field label="Blower On/Off RPM Range (Min – Max)">
                <div className="fv-voyage__inline-pair">
                  <input
                    type="number"
                    defaultValue={limits.blowerOnOffMin}
                    aria-label="Blower Min"
                  />
                  <span>–</span>
                  <input
                    type="number"
                    defaultValue={limits.blowerOnOffMax}
                    aria-label="Blower Max"
                  />
                </div>
              </Field>
              <Field label="Scrubber">
                <select defaultValue={limits.scrubber}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </Field>
              <Field label="EGCS Type">
                <select defaultValue={limits.egcs}>
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                  <option value="Loop">Loop</option>
                </select>
              </Field>
            </div>
          </div>

          <div>
            <h4 className="fv-voyage__sub-title">Weather Limits</h4>
            <table className="fv-voyage__mini-table">
              <thead>
                <tr>
                  <th />
                  <th>Min SWH (m)</th>
                  <th>Max SWH (m)</th>
                  <th>Max Wind (BF)</th>
                  <th>Max Sea (DSS)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Ballast</th>
                  <td>
                    <input type="number" step="0.1" defaultValue={limits.ballast.minSwh} />
                  </td>
                  <td>
                    <input type="number" step="0.1" defaultValue={limits.ballast.maxSwh} />
                  </td>
                  <td>
                    <input type="number" defaultValue={limits.ballast.maxWind} />
                  </td>
                  <td>
                    <input type="number" defaultValue={limits.ballast.maxSea} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">Laden</th>
                  <td>
                    <input type="number" step="0.1" defaultValue={limits.laden.minSwh} />
                  </td>
                  <td>
                    <input type="number" step="0.1" defaultValue={limits.laden.maxSwh} />
                  </td>
                  <td>
                    <input type="number" defaultValue={limits.laden.maxWind} />
                  </td>
                  <td>
                    <input type="number" defaultValue={limits.laden.maxSea} />
                  </td>
                </tr>
              </tbody>
            </table>

            <h4 className="fv-voyage__sub-title">Safety Limits</h4>
            <div className="fv-voyage__grid fv-voyage__grid--2">
              <Field label="Max SWH (m)">
                <input
                  type="number"
                  step="0.1"
                  defaultValue={limits.safety.maxSwhMt}
                />
              </Field>
              <Field label="Max Wind Speed (BF)">
                <input type="number" defaultValue={limits.safety.maxWindSpeed} />
              </Field>
            </div>
          </div>
        </div>
      </Section>

      {/* TELEGRAPH TABLE / M-E -------------------------------------- */}
      <Section
        id="telegraph"
        title="Telegraph Table & M/E Details"
        collapsed={isCollapsed('telegraph')}
        onToggle={() => toggleSection('telegraph')}
      >
        <div className="fv-voyage__telegraph">
          <table className="fv-voyage__mini-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>RPM</th>
              </tr>
            </thead>
            <tbody>
              {telegraph.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>
                    <input type="number" defaultValue={row.rpm} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="fv-voyage__grid fv-voyage__grid--2">
            <Field label="M/E Type">
              <input type="text" defaultValue={me.type} />
            </Field>
            <Field label="M/E Mode">
              <input type="text" defaultValue={me.mode} />
            </Field>
            <Field label="Beams (m)">
              <input type="number" defaultValue={me.beams} />
            </Field>
            <Field label="Ballast Draft (m)">
              <input type="number" step="0.1" defaultValue={me.draftBallast} />
            </Field>
            <Field label="Laden Draft (m)">
              <input type="number" step="0.1" defaultValue={me.draftLaden} />
            </Field>
            <Field label="Summer Draft (m)">
              <input type="number" step="0.1" defaultValue={me.summerDraft} />
            </Field>
            <Field label="Summer Displacement (MT)">
              <input type="number" defaultValue={me.summerDisplacement} />
            </Field>
            <Field label="Sea Trim Height (m)">
              <input type="number" step="0.1" defaultValue={me.seaTrimHeight} />
            </Field>
          </div>
        </div>
      </Section>

      {/* LEGS -------------------------------------------------------- */}
      <Section
        id="legs"
        title="Voyage / Legs"
        collapsed={isCollapsed('legs')}
        onToggle={() => toggleSection('legs')}
      >
        <ul className="fv-voyage__leg-tabs" role="tablist">
          {legs.map((leg) => {
            const isActive = leg.id === activeLegId;
            const isSelectedForMerge = selectedForMerge.includes(leg.id);
            return (
              <li key={leg.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`fv-voyage__leg-tab${
                    isActive ? ' fv-voyage__leg-tab--active' : ''
                  }${isSelectedForMerge ? ' fv-voyage__leg-tab--merging' : ''}`}
                  onClick={() => setActiveLegId(leg.id)}
                >
                  <span className="fv-voyage__leg-tab-num">LEG-{leg.legNumber}</span>
                  <span className="fv-voyage__leg-tab-type">{leg.legType}</span>
                  <span className="fv-voyage__leg-tab-route">
                    {leg.portFrom || '—'} → {leg.portTo || '—'}
                  </span>
                </button>
                <div className="fv-voyage__leg-tab-actions">
                  <label
                    className="fv-voyage__leg-merge"
                    title="Select for merge"
                  >
                    <input
                      type="checkbox"
                      checked={isSelectedForMerge}
                      onChange={() => toggleMergeSelection(leg.id)}
                    />
                  </label>
                  <button
                    type="button"
                    className="fv-voyage__icon-btn"
                    title="Remove leg"
                    onClick={() => removeLeg(leg.id)}
                    disabled={legs.length === 1}
                  >
                    <i className="fas fa-times" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {activeLeg && (
          <LegEditor
            leg={activeLeg}
            onChange={(key, value) => updateLeg(activeLeg.id, key, value)}
          />
        )}
      </Section>

      <footer className="fv-voyage__footer">
        <button
          type="button"
          className="fv-voyage__btn fv-voyage__btn--primary"
          onClick={handleSave}
        >
          <i className="fas fa-save" aria-hidden="true" /> Save Voyage
        </button>
        {savedAt && (
          <span className="fv-voyage__saved-tag">Saved at {savedAt}</span>
        )}
      </footer>
    </div>
  );
}

interface SectionProps {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({ title, collapsed, onToggle, children }: SectionProps) {
  return (
    <section className="fv-voyage__section">
      <header className="fv-voyage__section-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="fv-voyage__icon-btn"
          onClick={onToggle}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <i
            className={`fas ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}
            aria-hidden="true"
          />
        </button>
      </header>
      {!collapsed && <div className="fv-voyage__section-body">{children}</div>}
    </section>
  );
}

interface FieldProps {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}

function Field({ label, full, children }: FieldProps) {
  return (
    <label className={`fv-voyage__field${full ? ' fv-voyage__field--full' : ''}`}>
      <span className="fv-voyage__field-label">{label}</span>
      {children}
    </label>
  );
}

interface LegEditorProps {
  leg: LegData;
  onChange: <K extends keyof LegData>(key: K, value: LegData[K]) => void;
}

function LegEditor({ leg, onChange }: LegEditorProps) {
  const updateCp = <K extends keyof CpDetails>(key: K, value: CpDetails[K]) => {
    onChange('cpDetails', { ...leg.cpDetails, [key]: value });
  };
  const updateMarket = <K extends keyof MarketFactors>(
    key: K,
    value: MarketFactors[K],
  ) => {
    onChange('marketFactors', { ...leg.marketFactors, [key]: value });
  };
  const updateRow = (rowIdx: number, partial: Partial<SpeedConsRow>) => {
    onChange(
      'speedCons',
      leg.speedCons.map((row, i) => (i === rowIdx ? { ...row, ...partial } : row)),
    );
  };

  return (
    <div className="fv-voyage__leg-editor">
      <div className="fv-voyage__grid fv-voyage__grid--3">
        <Field label="Voyage Type">
          <select
            value={leg.legType}
            onChange={(e) => onChange('legType', e.target.value as LegType)}
          >
            {LEG_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Port From">
          <input
            type="text"
            value={leg.portFrom}
            onChange={(e) => onChange('portFrom', e.target.value)}
          />
        </Field>
        <Field label="Port To">
          <input
            type="text"
            value={leg.portTo}
            onChange={(e) => onChange('portTo', e.target.value)}
          />
        </Field>
        <Field label="ETD (Local Time)">
          <input
            type="datetime-local"
            value={leg.etd}
            onChange={(e) => onChange('etd', e.target.value)}
          />
        </Field>
        <Field label="Auto Route">
          <label className="fv-voyage__inline-check">
            <input
              type="checkbox"
              checked={leg.autoRoute}
              onChange={(e) => onChange('autoRoute', e.target.checked)}
            />
            Use exact match (else show nearby ports)
          </label>
        </Field>
        <Field label="Draft (m)">
          <input
            type="number"
            step="0.1"
            value={leg.draft}
            onChange={(e) => onChange('draft', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Displacement (MT)">
          <input
            type="number"
            value={leg.displacement}
            onChange={(e) => onChange('displacement', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="GM (m)">
          <input
            type="number"
            step="0.1"
            value={leg.gm}
            onChange={(e) => onChange('gm', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Roll Period (s)">
          <input
            type="number"
            step="0.1"
            value={leg.rollPeriod}
            onChange={(e) => onChange('rollPeriod', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Max Sign Wave Height (m)">
          <input
            type="number"
            step="0.1"
            value={leg.maxSwh}
            onChange={(e) => onChange('maxSwh', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Max Wind Speed (BF)">
          <input
            type="number"
            value={leg.maxWindSpeed}
            onChange={(e) => onChange('maxWindSpeed', Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      <h4 className="fv-voyage__sub-title">
        CP Details
        <label className="fv-voyage__inline-check">
          <input
            type="checkbox"
            checked={leg.cpSameAsPrevious}
            onChange={(e) => onChange('cpSameAsPrevious', e.target.checked)}
          />
          Keep same as previous leg
        </label>
      </h4>
      <fieldset
        className="fv-voyage__cp"
        disabled={leg.cpSameAsPrevious}
      >
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Field label="Winds (BF)">
            <input
              type="number"
              value={leg.cpDetails.windsBf}
              onChange={(e) => updateCp('windsBf', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="DSS">
            <input
              type="number"
              value={leg.cpDetails.dssCode}
              onChange={(e) => updateCp('dssCode', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="SWH (m)">
            <input
              type="number"
              step="0.1"
              value={leg.cpDetails.swh}
              onChange={(e) => updateCp('swh', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Min Hours (Good Weather)">
            <input
              type="number"
              value={leg.cpDetails.minHours}
              onChange={(e) => updateCp('minHours', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Currents">
            <input
              type="text"
              value={leg.cpDetails.currents}
              onChange={(e) => updateCp('currents', e.target.value)}
            />
          </Field>
          <Field label="Allowable Fuel Method">
            <input
              type="text"
              value={leg.cpDetails.allowableFuelMethod}
              onChange={(e) => updateCp('allowableFuelMethod', e.target.value)}
            />
          </Field>
          <Field label="About Speed">
            <input
              type="text"
              value={leg.cpDetails.aboutSpeed}
              onChange={(e) => updateCp('aboutSpeed', e.target.value)}
            />
          </Field>
          <Field label="Time Gain">
            <input
              type="text"
              value={leg.cpDetails.timeGain}
              onChange={(e) => updateCp('timeGain', e.target.value)}
            />
          </Field>
          <Field label="Time Loss">
            <input
              type="text"
              value={leg.cpDetails.timeLoss}
              onChange={(e) => updateCp('timeLoss', e.target.value)}
            />
          </Field>
          <Field label="Selection">
            <input
              type="text"
              value={leg.cpDetails.selection}
              onChange={(e) => updateCp('selection', e.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <h4 className="fv-voyage__sub-title">Speed &amp; Cons</h4>
      <div className="fv-voyage__speed-cons-scroll">
        <table className="fv-voyage__speed-cons">
          <thead>
            <tr>
              <th>Description</th>
              <th>Speed (kt)</th>
              <th>Fuel Type</th>
              <th>ECA</th>
              <th>Daily Cons (MT)</th>
              <th>Alt Fuel</th>
              <th>Alt Daily</th>
              <th>3rd Fuel</th>
              <th>3rd Daily</th>
            </tr>
          </thead>
          <tbody>
            {leg.speedCons.map((row, i) => (
              <tr key={`${row.description}-${i}`}>
                <th scope="row">{row.description}</th>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={row.speed}
                    onChange={(e) =>
                      updateRow(i, { speed: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <select
                    value={row.fuelType}
                    onChange={(e) =>
                      updateRow(i, { fuelType: e.target.value as FuelType })
                    }
                  >
                    {FUEL_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="fv-voyage__center">
                  <input
                    type="checkbox"
                    checked={row.isEca}
                    onChange={(e) => updateRow(i, { isEca: e.target.checked })}
                    aria-label="ECA fuel"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={row.dailyCons}
                    onChange={(e) =>
                      updateRow(i, { dailyCons: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <select
                    value={row.altFuelType ?? ''}
                    onChange={(e) =>
                      updateRow(i, {
                        altFuelType: (e.target.value || undefined) as FuelType | undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    {FUEL_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={row.altDailyCons ?? ''}
                    onChange={(e) =>
                      updateRow(i, {
                        altDailyCons:
                          e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td>
                  <select
                    value={row.thirdFuelType ?? ''}
                    onChange={(e) =>
                      updateRow(i, {
                        thirdFuelType: (e.target.value || undefined) as
                          | FuelType
                          | undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    {FUEL_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={row.thirdDailyCons ?? ''}
                    onChange={(e) =>
                      updateRow(i, {
                        thirdDailyCons:
                          e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="fv-voyage__sub-title">Market Factors</h4>
      <div className="fv-voyage__grid fv-voyage__grid--4">
        <Field label="Daily Hire Rate ($)">
          <input
            type="number"
            value={leg.marketFactors.dailyHireRate}
            onChange={(e) =>
              updateMarket('dailyHireRate', Number(e.target.value) || 0)
            }
          />
        </Field>
        <Field label="FO Cost ($/MT)">
          <input
            type="number"
            value={leg.marketFactors.foCost}
            onChange={(e) => updateMarket('foCost', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="DO Cost ($/MT)">
          <input
            type="number"
            value={leg.marketFactors.doCost}
            onChange={(e) => updateMarket('doCost', Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="EUA Cost ($/MT CO₂)">
          <input
            type="number"
            step="0.1"
            value={leg.marketFactors.euaCost}
            onChange={(e) => updateMarket('euaCost', Number(e.target.value) || 0)}
          />
        </Field>
      </div>
    </div>
  );
}
