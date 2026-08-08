import { Badge, Card, Info } from './primitives';
import type { EngineSpeedConsRow, LegRow, VoyageView } from './types';

interface Props {
  view: VoyageView;
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const yn = (b: boolean) => (b ? 'Yes' : 'No');
const dash = (v: string) => v || '—';

/** A read-only note block mirroring the editable sections' display state. */
function NoteBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="fv-voyage__col">
      <span className="fv-voyage__info-label">{label}</span>
      <p className="fv-voyage__notes">{value || '—'}</p>
    </div>
  );
}

/** Read-only speed & cons rows for a single load condition. */
function SpeedConsTable({ rows, condition }: { rows: EngineSpeedConsRow[]; condition: string }) {
  const filtered = rows.filter((r) => r.condition === condition);
  return (
    <div className="fv-voyage__table-scroll">
      <table className="fv-voyage__dtable">
        <thead>
          <tr>
            <th>Speed (kt)</th>
            <th>Cons M/E (mt/day)</th>
            <th>Cons A/E (mt/day)</th>
            <th>RPM</th>
            <th>MCR %</th>
            <th>Power (kW)</th>
            <th>EPL Limit</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length ? (
            filtered.map((r, i) => (
              <tr key={i}>
                <td>{dash(r.speed)}</td>
                <td>{dash(r.consME)}</td>
                <td>{dash(r.consAE)}</td>
                <td>{dash(r.rpm)}</td>
                <td>{dash(r.mcrPercent)}</td>
                <td>{dash(r.powerKw)}</td>
                <td>{dash(r.eplLimit)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7}>—</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Compute ETD in local time from UTC string + UTC±n timezone. */
function etdLT(etdUtc: string, tz: string): string {
  if (!etdUtc || !tz) return '—';
  const tzMatch = tz.match(/UTC([+-]?\d+)/);
  if (!tzMatch) return '—';
  const offset = parseInt(tzMatch[1], 10);
  if (isNaN(offset)) return '—';
  const normalised = etdUtc
    .replace(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}:\d{2}).*/, '$2 $1 $3 $4 UTC')
    .replace(/(\d{2})\s+([A-Za-z]{3})\s+(\d{4}),\s+(\d{2}:\d{2}).*/, '$2 $1 $3 $4 UTC');
  const d = new Date(normalised);
  if (isNaN(d.getTime())) return '—';
  d.setUTCHours(d.getUTCHours() + offset);
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(d.getUTCDate()).padStart(2,'0');
  const hh = String(d.getUTCHours()).padStart(2,'0');
  const mm = String(d.getUTCMinutes()).padStart(2,'0');
  return `${dd}-${MONS[d.getUTCMonth()]}-${d.getUTCFullYear()} ${hh}:${mm} LT`;
}

/** Read-only, compact rendering of a single leg. */
function LegBlock({ leg }: { leg: LegRow }) {
  const route = `${dash(leg.from)} → ${dash(leg.to)}`;
  return (
    <div className="fv-voyage__summary-leg">
      <h5 className="fv-voyage__subhead">
        Leg {dash(leg.no)} · {route}
      </h5>
      <div className="fv-voyage__cols fv-voyage__cols--4">
        <Info label="Voyage Type" value={dash(leg.type)} />
        <Info label="Status" value={dash(leg.status)} />
        <Info label="ETD (UTC)" value={dash(leg.etd)} />
        <Info label="Time Zone" value={dash(leg.etdTimezone)} />
        <Info label="ETD (LT)" value={etdLT(leg.etd, leg.etdTimezone)} />
        <Info label="Auto Route" value={leg.autoRoute ? 'On' : 'Off'} />
        <Info label="Distance (NM)" value={dash(leg.distanceNm)} />
      </div>
      {leg.useDifferentCp && (
        <>
          <div className="fv-voyage__cols fv-voyage__cols--5">
            <Info label="Winds (BF)" value={dash(leg.cpWinds)} />
            <Info label="DSS" value={dash(leg.cpDss)} />
            <Info label="SWH" value={dash(leg.cpSwh)} />
            <Info label="Min Hours (h)" value={dash(leg.cpMinHours)} />
            <Info label="Currents" value={dash(leg.cpCurrents)} />
          </div>
          <div className="fv-voyage__cols fv-voyage__cols--5">
            <Info label="Good Weather Selection" value={dash(leg.cpGoodWeatherSelection)} />
            <Info label="Allowable Fuel Method" value={dash(leg.cpAllowableFuelMethod)} />
            <Info label="About Speed" value={leg.cpAboutSpeed ? `${leg.cpAboutSpeed} ${leg.cpAboutSpeedUnit || ''}`.trim() : '—'} />
            <Info label="Time Gain (%)" value={dash(leg.cpTimeGain)} />
            <Info label="Time Loss (%)" value={dash(leg.cpTimeLoss)} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Read-only Voyage Summary. Presents every field captured across Order Details,
 * Vessel Profile, Leg Details and Notes, organised into clearly labelled
 * sections. This tab is view-only — no field is editable here.
 */
export function VoyageSummarySection({ view, title, collapsed, onToggleCollapse }: Props) {
  const firstLeg = view.legs[0];
  const lastLeg = view.legs[view.legs.length - 1];
  const route =
    firstLeg && lastLeg ? `${firstLeg.from || '—'} → ${lastLeg.to || '—'}` : '—';
  const departure = firstLeg?.etd || '—';
  const arrival = lastLeg?.etd || '—';
  const isOptimization = view.serviceType === 'Optimization';

  return (
    <Card title={title} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className="fv-voyage__dense fv-voyage__summary-view">
        {/* Overview */}
        <h5 className="fv-voyage__subhead">Overview</h5>
        <div className="fv-voyage__cols fv-voyage__cols--4">
          <Info label="Vessel Name" value={dash(view.vesselName)} />
          <Info label="IMO" value={dash(view.imo)} />
          <Info label="Vessel Type" value={dash(view.vesselType)} />
          <Info label="Flag" value={dash(view.flag)} />
          <Info label="Account" value={dash(view.client)} />
          {view.jointNomination && (
            <Info label="2nd Account (Joint Nom.)" value={dash(view.client2)} />
          )}
          <Info label="Service Type" value={dash(view.serviceType)} />
          <Info
            label="Status"
            value={view.status ? <Badge tone="active">{view.status}</Badge> : '—'}
          />
          <Info label="Route" value={route} />
          <Info label="Departure (ETD)" value={departure} />
          <Info label="Arrival (ETA)" value={arrival} />
          <Info label="Voyage Duration" value={dash(view.duration)} />
          <Info label="No. of Legs" value={String(view.legs.length)} />
          <Info
            label="Emission Reporting"
            value={view.emissionReportRequired ? 'Required' : 'Not required'}
          />
          <Info label="Created On" value={dash(view.createdOn)} />
          <Info label="Last Updated" value={dash(view.lastUpdated)} />
        </div>

        {/* 1. Order & Account Information */}
        <h5 className="fv-voyage__subhead">Order &amp; Account Information</h5>
        <div className="fv-voyage__cols fv-voyage__cols--3">
          <Info label="Service Type" value={dash(view.serviceType)} />
          <Info label="Account Name" value={dash(view.client)} />
          <Info label="Account Type" value={dash(view.clientType)} />
          <Info label="Price" value={dash(view.price)} />
          <Info label="Pricing Basis" value={dash(view.pricingBasis)} />
          <Info label="Emission Report Required?" value={yn(view.emissionReportRequired)} />
          <Info label="Account Email List" value={dash(view.clientEmailList)} />
          <Info label="For Daily Fleet Summary" value={dash(view.dailyFleetSummaryEmail)} />
        </div>
        <div className="fv-voyage__cols fv-voyage__cols--3">
          <Info label="Joint Nomination?" value={yn(view.jointNomination)} />
          {!view.jointNomination && <Info label="ODAS PIC" value={dash(view.pic)} />}
        </div>
        {view.jointNomination && (
          <>
            <h5 className="fv-voyage__subhead">2nd Account (Joint Nomination)</h5>
            <div className="fv-voyage__cols fv-voyage__cols--3">
              <Info label="Account Name" value={dash(view.client2)} />
              <Info label="Account Type" value={dash(view.clientType2)} />
              <Info label="Price" value={dash(view.price2)} />
              <Info label="Pricing Basis" value={dash(view.pricingBasis2)} />
              <Info label="Account Email List" value={dash(view.clientEmailList2)} />
              <Info label="For Daily Fleet Summary" value={dash(view.dailyFleetSummaryEmail2)} />
            </div>
            <div className="fv-voyage__cols fv-voyage__cols--3">
              <Info label="ODAS PIC" value={dash(view.pic)} />
            </div>
          </>
        )}
        {isOptimization && (
          <>
            <p className="fv-voyage__subhead">Market Factors</p>
            <div className="fv-voyage__cols fv-voyage__cols--3">
              <Info label="Hire Rate (USD/day)" value={dash(view.hireRate)} />
              <Info label="FO Price (USD/MT)" value={dash(view.foPrice)} />
              <Info label="GO Price (USD/MT)" value={dash(view.goPrice)} />
              <Info label="3rd Fuel Type" value={dash(view.thirdFuelType)} />
              <Info label="3rd Fuel Price (USD/MT)" value={dash(view.thirdFuelPrice)} />
              <Info label="EUA's Price (USD/MT)" value={dash(view.euaPrice)} />
            </div>
          </>
        )}
        <div className="fv-voyage__cols fv-voyage__cols--1">
          <NoteBlock label="Account Notes / Instructions" value={view.clientNotes} />
        </div>

        {/* 2. Vessel Profile */}
        <h5 className="fv-voyage__subhead">Vessel Profile — Vessel &amp; Engine Details</h5>
        <div className="fv-voyage__cols fv-voyage__cols--4">
          <Info label="Vessel Email" value={dash(view.vesselEmail)} />
          <Info label="ECDIS Model" value={dash(view.ecdisModel)} />
          <Info label="M/E Type" value={dash(view.meType)} />
          <Info label="M/E Model" value={dash(view.meModel)} />
          <Info label="LOA (m)" value={dash(view.loa)} />
          <Info label="Beam (m)" value={dash(view.beam)} />
          <Info label="Default Draft — Ballast (m)" value={dash(view.defaultBallastDraft)} />
          <Info label="Default Draft — Laden (m)" value={dash(view.defaultLadenDraft)} />
          <Info label="Summer Draft (m)" value={dash(view.summerDraft)} />
          <Info label="Summer Displacement (MT)" value={dash(view.summerDisplacement)} />
          <Info label="Summer Deadweight (MT)" value={dash(view.summerDeadweight)} />
          <Info label="Auto Send Forecast" value={yn(view.autoSendForecast)} />
          <Info label="Forecast Time" value={dash(view.autoSendForecastTime)} />
          <Info label="4X Weather" value={yn(view.weather4x)} />
          <Info label="4X Weather Duration" value={dash(view.weather4xDuration)} />
          <Info label="Auto Reports" value={yn(view.autoSendReports)} />
          <Info label="Scrubber" value={yn(view.scrubber)} />
          <Info label="Scrubber Type" value={dash(view.scrubberType)} />
        </div>

        <div className="fv-voyage__cols fv-voyage__cols--3">
          <div className="fv-voyage__col">
            <span className="fv-voyage__info-label">Engine Limits &amp; Constraints</span>
            <div className="fv-voyage__table-scroll">
              <table className="fv-voyage__dtable">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>RPM</td>
                    <td>{dash(view.minRpm)}</td>
                    <td>{dash(view.maxRpm)}</td>
                  </tr>
                  <tr>
                    <td>MCR (kW)</td>
                    <td>{dash(view.minMcr)}</td>
                    <td>{dash(view.maxMcr)}</td>
                  </tr>
                  <tr>
                    <td>Speed (kt)</td>
                    <td>{dash(view.minSpeed)}</td>
                    <td>{dash(view.maxSpeed)}</td>
                  </tr>
                  <tr>
                    <td>Power Fraction</td>
                    <td>{dash(view.minPowerFraction)}</td>
                    <td>{dash(view.maxPowerFraction)}</td>
                  </tr>
                  <tr>
                    <td>Nominal Power Fraction</td>
                    <td>{dash(view.nominalPowerFraction)}</td>
                    <td>—</td>
                  </tr>
                  <tr>
                    <td>Blower On/Off — Ballast (RPM)</td>
                    <td>{dash(view.blowerBallastMin)}</td>
                    <td>{dash(view.blowerBallastMax)}</td>
                  </tr>
                  <tr>
                    <td>Blower On/Off — Laden (RPM)</td>
                    <td>{dash(view.blowerLadenMin)}</td>
                    <td>{dash(view.blowerLadenMax)}</td>
                  </tr>
                  <tr>
                    <td>Critical RPM (RPM)</td>
                    <td>{dash(view.criticalRpmMin)}</td>
                    <td>{dash(view.criticalRpmMax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="fv-voyage__col">
            <span className="fv-voyage__info-label">Telegraph Table</span>
            <div className="fv-voyage__table-scroll">
              <table className="fv-voyage__dtable">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>RPM</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Dead Slow Ahead</td>
                    <td>{dash(view.deadSlowRpm)}</td>
                  </tr>
                  <tr>
                    <td>Slow Ahead</td>
                    <td>{dash(view.slowAheadRpm)}</td>
                  </tr>
                  <tr>
                    <td>Half Ahead</td>
                    <td>{dash(view.halfAheadRpm)}</td>
                  </tr>
                  <tr>
                    <td>Full Ahead</td>
                    <td>{dash(view.fullAheadRpm)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="fv-voyage__col">
            <span className="fv-voyage__info-label">Weather Safety Limits</span>
            <div className="fv-voyage__table-scroll">
              <table className="fv-voyage__dtable">
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Ballast</th>
                    <th>Laden</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Max SWH (m)</td>
                    <td>{dash(view.wslMaxSwhBallast)}</td>
                    <td>{dash(view.wslMaxSwhLaden)}</td>
                  </tr>
                  <tr>
                    <td>Max Winds (BF)</td>
                    <td>{dash(view.wslMaxWindsBallast)}</td>
                    <td>{dash(view.wslMaxWindsLaden)}</td>
                  </tr>
                  <tr>
                    <td>Max Sea State (DSS)</td>
                    <td>{dash(view.wslMaxSeaStateBallast)}</td>
                    <td>{dash(view.wslMaxSeaStateLaden)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {isOptimization && (
          <div className="fv-voyage__cols fv-voyage__cols--2">
            <div className="fv-voyage__col">
              <span className="fv-voyage__info-label">Speed &amp; Cons Profile — Ballast</span>
              <SpeedConsTable rows={view.engineSpeedCons} condition="Ballast" />
            </div>
            <div className="fv-voyage__col">
              <span className="fv-voyage__info-label">Speed &amp; Cons Profile — Laden</span>
              <SpeedConsTable rows={view.engineSpeedCons} condition="Laden" />
            </div>
          </div>
        )}

        {/* 3. CP Details — Good Weather Criteria (default, from first leg) */}
        <h5 className="fv-voyage__subhead">CP Details — Good Weather Criteria</h5>
        {view.legs[0] ? (
          <>
            <div className="fv-voyage__cols fv-voyage__cols--5">
              <Info label="Winds (BF)" value={dash(view.legs[0].cpWinds)} />
              <Info label="DSS" value={dash(view.legs[0].cpDss)} />
              <Info label="SWH" value={dash(view.legs[0].cpSwh)} />
              <Info label="Min Hours (h)" value={dash(view.legs[0].cpMinHours)} />
              <Info label="Currents" value={dash(view.legs[0].cpCurrents)} />
            </div>
            <div className="fv-voyage__cols fv-voyage__cols--5">
              <Info label="Good Weather Selection" value={dash(view.legs[0].cpGoodWeatherSelection)} />
              <Info label="Allowable Fuel Method" value={dash(view.legs[0].cpAllowableFuelMethod)} />
              <Info label="About Speed" value={view.legs[0].cpAboutSpeed ? `${view.legs[0].cpAboutSpeed} ${view.legs[0].cpAboutSpeedUnit || ''}`.trim() : '—'} />
              <Info label="Time Gain (%)" value={dash(view.legs[0].cpTimeGain)} />
              <Info label="Time Loss (%)" value={dash(view.legs[0].cpTimeLoss)} />
            </div>
          </>
        ) : (
          <p className="fv-voyage__notes">No legs defined.</p>
        )}

        {/* 4. Leg Details */}
        <h5 className="fv-voyage__subhead">Leg Details</h5>
        {view.legs.length ? (
          view.legs.map((leg, i) => <LegBlock key={i} leg={leg} />)
        ) : (
          <p className="fv-voyage__notes">No legs defined.</p>
        )}

        {/* 4. Notes */}
        <h5 className="fv-voyage__subhead">Notes</h5>
        <div className="fv-voyage__cols fv-voyage__cols--1">
          <NoteBlock label="Operational Notes" value={view.operationalNotes} />
          <NoteBlock label="Master Remarks" value={view.masterRemarks} />
          <NoteBlock label="Internal Notes" value={view.internalNotes} />
        </div>
      </div>
    </Card>
  );
}


