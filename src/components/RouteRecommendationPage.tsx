import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildRouteRecommendationEmail } from '../data/reports';
import { ReportsPageShell } from './ReportsTabs';
import { ReportEmailComposer } from './ReportEmailComposer';

/**
 * Route Recommendation page — `/reports/route-recommendation`.
 *
 * Sends the route recommendation email, generated from the voyage's
 * route data for the selected order.
 */
export function RouteRecommendationPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <ReportsPageShell active="route" icon="fa-route" title="Route Recommendation">
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
    <ReportsPageShell active="route" icon="fa-route" title="Route Recommendation">
      <ReportEmailComposer key={voyage.id} build={() => buildRouteRecommendationEmail(voyage)} />
    </ReportsPageShell>
  );
}
