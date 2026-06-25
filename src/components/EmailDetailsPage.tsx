import { useSelectedVoyage } from '../data/selectedVoyage';
import { getEmailDetails } from '../data/voyageDetails';
import { DetailCard, DetailPage, NoVoyage } from './DetailPrimitives';

/**
 * Email Details page — `/email`.
 *
 * Lists the email contacts for the open voyage's client (operations,
 * chartering, vessel, emergency, accounts) and a recent correspondence
 * log. Contacts and log are derived from the selected `Voyage` so they
 * stay consistent with the Client and Vessel detail pages.
 */
export function EmailDetailsPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <DetailPage icon="fa-envelope" title="Email Details" current="/email">
        <NoVoyage voyage={voyage} />
      </DetailPage>
    );
  }

  const e = getEmailDetails(voyage);

  return (
    <DetailPage icon="fa-envelope" title="Email Details" current="/email">
      <DetailCard number={1} title={`EMAIL DISTRIBUTION \u2014 ${e.clientName.toUpperCase()}`}>
        <div className="fv-voyage__table-scroll">
          <table className="fv-voyage__dtable fv-voyage__dtable--wide">
            <thead>
              <tr>
                <th>Role</th>
                <th>Name</th>
                <th>Email Address</th>
              </tr>
            </thead>
            <tbody>
              {e.contacts.map((contact) => (
                <tr key={contact.role}>
                  <td>{contact.role}</td>
                  <td>{contact.name}</td>
                  <td>
                    <a href={`mailto:${contact.address}`}>{contact.address}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailCard>

      <DetailCard number={2} title="CORRESPONDENCE LOG">
        <div className="fv-voyage__table-scroll">
          <table className="fv-voyage__dtable fv-voyage__dtable--wide">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Subject</th>
                <th>Counterparty</th>
                <th>Direction</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {e.log.map((row, i) => (
                <tr key={`${row.subject}-${i}`}>
                  <td>{row.date}</td>
                  <td>{row.subject}</td>
                  <td>
                    <a href={`mailto:${row.to}`}>{row.to}</a>
                  </td>
                  <td>
                    <span
                      className={`fv-voyage__badge fv-voyage__badge--${
                        row.direction === 'Sent' ? 'active' : 'planned'
                      }`}
                    >
                      {row.direction}
                    </span>
                  </td>
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
