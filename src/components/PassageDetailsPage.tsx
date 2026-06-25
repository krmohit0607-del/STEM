import { Link } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import { getPassageDetails } from '../data/voyageDetails';
import { DetailCard, DetailPage, Info, NoVoyage } from './DetailPrimitives';

/**
 * Passage Details page — `/passage`.
 *
 * Lists every passage (leg) of the open voyage: origin, interim and
 * destination ports with distance, planned speed, ETD/ETA and status.
 * Distances are great-circle estimates between the known port
 * coordinates. Derived from the selected `Voyage`.
 */
export function PassageDetailsPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <DetailPage icon="fa-map-location-dot" title="Passage Details" current="/passage">
        <NoVoyage voyage={voyage} />
      </DetailPage>
    );
  }

  const p = getPassageDetails(voyage);

  return (
    <DetailPage icon="fa-map-location-dot" title="Passage Details" current="/passage">
      <DetailCard number={1} title="PASSAGE SUMMARY">
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Info label="Vessel" value={p.vessel} />
          <Info label="Origin" value={p.origin} />
          <Info label="Destination" value={p.destination} />
          <Info label="Interim Port" value={p.interimPort} />
          <Info label="Route Ref" value={p.routeRef} />
          <Info label="Total Distance" value={`${p.totalDistanceNm} NM`} />
        </div>
      </DetailCard>

      <DetailCard number={2} title="PASSAGE LEGS">
        <div className="fv-voyage__table-scroll">
          <table className="fv-voyage__dtable fv-voyage__dtable--wide">
            <thead>
              <tr>
                <th>No.</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>ETD</th>
                <th>ETA</th>
                <th>Distance (NM)</th>
                <th>Speed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {p.legs.map((leg) => (
                <tr key={leg.no}>
                  <td>{leg.no}</td>
                  <td>{leg.type}</td>
                  <td>{leg.from}</td>
                  <td>{leg.to}</td>
                  <td>{leg.etd}</td>
                  <td>{leg.eta}</td>
                  <td>{leg.distanceNm}</td>
                  <td>{leg.speed}</td>
                  <td>
                    <span
                      className={`fv-voyage__badge fv-voyage__badge--${
                        leg.status === 'Active' ? 'active' : 'planned'
                      }`}
                    >
                      {leg.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailCard>

      <DetailCard number={3} title="ROUTE TOOLS" defaultCollapsed>
        <p className="fv-voyage__notes">
          Open the full waypoint editor and route comparison from the{' '}
          <Link to="/route-explorer">Route Explorer</Link> or{' '}
          <Link to="/route-simulator">Route Simulator</Link>.
        </p>
      </DetailCard>
    </DetailPage>
  );
}
