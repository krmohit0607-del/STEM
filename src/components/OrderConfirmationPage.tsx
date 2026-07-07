import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildOrderConfirmationEmail } from '../data/reports';
import { ReportsPageShell } from './ReportsTabs';
import { ReportEmailComposer } from './ReportEmailComposer';

/**
 * Order Confirmation page — `/reports/order-confirmation`.
 *
 * Sends the order confirmation email to the client, generated from the
 * voyage / client / vessel / port data for the selected order.
 */
export function OrderConfirmationPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <ReportsPageShell active="order" icon="fa-file-signature" title="Order Confirmation">
        <section className="fv-voyage__card">
          <div className="fv-voyage__card-body">
            <p className="fv-voyage__notes">
              No open voyage is selected. Open a vessel from the Fleet List to create its reports.
            </p>
          </div>
        </section>
      </ReportsPageShell>
    );
  }

  return (
    <ReportsPageShell active="order" icon="fa-file-signature" title="Order Confirmation">
      <ReportEmailComposer key={voyage.id} build={() => buildOrderConfirmationEmail(voyage)} />
    </ReportsPageShell>
  );
}
