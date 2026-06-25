import { Link } from 'react-router-dom';

import { useSelectedVoyage } from '../data/selectedVoyage';
import { getClientDetails } from '../data/voyageDetails';
import { DetailCard, DetailPage, Info, NoVoyage } from './DetailPrimitives';

/**
 * Client Details page — `/client`.
 *
 * Shows the commercial relationship for the open voyage's client plus the
 * client's other open voyages. Each fleet row links back to that voyage so
 * the user can pivot between vessels of the same client.
 */
export function ClientDetailsPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <DetailPage icon="fa-building" title="Client Details" current="/client">
        <NoVoyage voyage={voyage} />
      </DetailPage>
    );
  }

  const c = getClientDetails(voyage);

  return (
    <DetailPage icon="fa-building" title="Client Details" current="/client">
      <DetailCard number={1} title="CLIENT PROFILE">
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Info label="Client Name" value={c.clientName} />
          <Info label="Client Type" value={c.clientType} />
          <Info label="Segment" value={c.segment} />
          <Info label="Region" value={c.region} />
          <Info label="Account Manager" value={c.accountManager} />
          <Info
            label="Status"
            value={<span className="fv-voyage__badge fv-voyage__badge--active">{c.status}</span>}
          />
          <Info label="Contract Ref" value={c.contractRef} />
          <Info label="Client Since" value={c.clientSince} />
        </div>
      </DetailCard>

      <DetailCard number={2} title="SERVICE & COMMERCIAL">
        <div className="fv-voyage__grid fv-voyage__grid--3">
          <Info label="Service Type" value={c.service} />
          <Info label="Pricing Basis" value={c.pricingBasis} />
          <Info label="Price" value={c.price} />
          <Info label="PIC" value={c.pic} />
          <Info label="Team" value={c.team} />
        </div>
      </DetailCard>

      <DetailCard number={3} title={`OTHER VOYAGES \u2014 ${c.clientName.toUpperCase()}`}>
        <div className="fv-voyage__table-scroll">
          <table className="fv-voyage__dtable fv-voyage__dtable--wide">
            <thead>
              <tr>
                <th>Voyage</th>
                <th>Vessel</th>
                <th>Route</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {c.fleet.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/voyage?voyage=${encodeURIComponent(row.id)}`}>{row.id}</Link>
                  </td>
                  <td>{row.vessel}</td>
                  <td>{row.route}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailCard>
    </DetailPage>
  );
}
