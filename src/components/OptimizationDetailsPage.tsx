import { Link } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import { DetailCard, Info, NoVoyage } from './DetailPrimitives';

/**
 * Optimization Details page — `/optimization`.
 *
 * Reached from the "Optimization details" item under the Interim Dashboard
 * tab in the left sidebar. Summarises the optimization objective and
 * constraints applied to the open voyage and compares the baseline plan
 * against the optimized recommendation.
 *
 * No API data is wired yet — when the optimization endpoints are exposed
 * for the React app, replace the stub objects below with live data derived
 * from the selected `Voyage`.
 */

interface ScenarioRow {
  scenario: string;
  distanceNm: string;
  steamingTime: string;
  fuelMt: string;
  costUsd: string;
  emissionsMt: string;
}

interface ConstraintRow {
  parameter: string;
  value: string;
  status: 'Met' | 'Watch';
}

const SCENARIOS: ScenarioRow[] = [
  {
    scenario: 'CP / Baseline',
    distanceNm: '6,420',
    steamingTime: '24.1 days',
    fuelMt: '722.4',
    costUsd: '$469,560',
    emissionsMt: '2,247',
  },
  {
    scenario: 'Least Cost',
    distanceNm: '6,448',
    steamingTime: '24.6 days',
    fuelMt: '684.1',
    costUsd: '$444,665',
    emissionsMt: '2,128',
  },
  {
    scenario: 'Least Emission',
    distanceNm: '6,471',
    steamingTime: '25.0 days',
    fuelMt: '671.8',
    costUsd: '$447,640',
    emissionsMt: '2,090',
  },
  {
    scenario: 'RTA (Required Time of Arrival)',
    distanceNm: '6,434',
    steamingTime: '24.0 days',
    fuelMt: '705.9',
    costUsd: '$458,835',
    emissionsMt: '2,196',
  },
];

const CONSTRAINTS: ConstraintRow[] = [
  { parameter: 'Min / Max Speed', value: '9.5 – 13.0 kt', status: 'Met' },
  { parameter: 'Max Weather (BF)', value: 'BF ≤ 7', status: 'Met' },
  { parameter: 'Max Sig. Wave Height', value: '4.5 m', status: 'Watch' },
  { parameter: 'ECA Compliance', value: 'Avoid where viable', status: 'Met' },
  { parameter: 'No-Go / Block Zones', value: 'HRA piracy zone', status: 'Met' },
  { parameter: 'RTA Window', value: 'Jul 08, 06:00Z ± 12h', status: 'Met' },
];

export function OptimizationDetailsPage() {
  const voyage = useSelectedVoyage();

  return (
    <div className="fv-voyage">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-wand-magic-sparkles" />
          </span>
          <div>
            <h1>Optimization Details</h1>
            <p className="fv-voyage__sub">
              {voyage
                ? `${voyage.vessel} \u00b7 IMO ${voyage.imo} \u00b7 ${voyage.client} \u00b7 ${voyage.portFrom} \u2192 ${voyage.portTo}`
                : 'No voyage selected \u2014 open one from the Fleet List.'}
            </p>
          </div>
        </div>
      </header>

      <nav className="fv-voyage__tabs" aria-label="Interim sections">
        <Link
          to={voyage ? `/interim?voyage=${encodeURIComponent(voyage.id)}` : '/interim'}
          className="fv-voyage__tab"
        >
          <i className="fas fa-bolt" aria-hidden="true" /> Interim Dashboard
        </Link>
        <Link to="/optimization" className="fv-voyage__tab fv-voyage__tab--active" aria-current="page">
          <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Optimization Details
        </Link>
      </nav>

      {!voyage ? (
        <NoVoyage voyage={voyage} />
      ) : (
        <>
          <DetailCard number={1} title="OPTIMIZATION OBJECTIVE">
            <div className="fv-voyage__grid fv-voyage__grid--3">
              <Info label="Objective" value="Least Cost" />
              <Info label="Optimization Type" value="RTA / Least Cost" />
              <Info
                label="Status"
                value={
                  <span className="fv-voyage__badge fv-voyage__badge--active">Optimized</span>
                }
              />
              <Info label="Last Run" value="Jun 25, 08:14Z" />
              <Info label="Engine Version" value="v4.2.1" />
              <Info label="Weather Source" value="DTN / ECMWF blend" />
            </div>
          </DetailCard>

          <DetailCard number={2} title="CONSTRAINTS APPLIED">
            <div className="fv-voyage__table-scroll">
              <table className="fv-voyage__dtable fv-voyage__dtable--wide">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {CONSTRAINTS.map((row) => (
                    <tr key={row.parameter}>
                      <td>{row.parameter}</td>
                      <td>{row.value}</td>
                      <td>
                        <span
                          className={`fv-voyage__badge fv-voyage__badge--${
                            row.status === 'Met' ? 'active' : 'planned'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailCard>

          <DetailCard number={3} title="SCENARIO COMPARISON">
            <div className="fv-voyage__table-scroll">
              <table className="fv-voyage__dtable fv-voyage__dtable--wide">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Distance (NM)</th>
                    <th>Steaming Time</th>
                    <th>Fuel (MT)</th>
                    <th>Cost (USD)</th>
                    <th>CO₂ (MT)</th>
                  </tr>
                </thead>
                <tbody>
                  {SCENARIOS.map((row) => (
                    <tr key={row.scenario}>
                      <td>{row.scenario}</td>
                      <td>{row.distanceNm}</td>
                      <td>{row.steamingTime}</td>
                      <td>{row.fuelMt}</td>
                      <td>{row.costUsd}</td>
                      <td>{row.emissionsMt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailCard>

          <DetailCard number={4} title="RECOMMENDED PLAN" defaultCollapsed>
            <div className="fv-voyage__grid fv-voyage__grid--3">
              <Info label="Recommended Scenario" value="Least Cost" />
              <Info label="Fuel Saving vs CP" value="-38.3 MT" />
              <Info label="Cost Saving vs CP" value="-$24,895" />
              <Info label="CO₂ Reduction vs CP" value="-119 MT" />
              <Info label="ETA Impact" value="+0.5 days" />
              <Info label="Confidence" value="High" />
            </div>
            <p className="fv-voyage__notes">
              Open the full waypoint editor and route comparison from the{' '}
              <Link to="/route-explorer">Route Explorer</Link> or{' '}
              <Link to="/route-simulator">Route Simulator</Link>.
            </p>
          </DetailCard>
        </>
      )}
    </div>
  );
}
