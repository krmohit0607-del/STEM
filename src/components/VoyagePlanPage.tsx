import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildVoyagePlanEmail } from '../data/reports';
import { ReportsPageShell } from './ReportsTabs';
import { ReportEmailComposer } from './ReportEmailComposer';

/**
 * Voyage Plan page — `/reports/voyage-plan`.
 *
 * Sends the voyage plan email, generated from the voyage's route data
 * for the selected order.
 */
export function VoyagePlanPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <ReportsPageShell active="plan" icon="fa-map-location-dot" title="Voyage Plan">
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
    <ReportsPageShell active="plan" icon="fa-map-location-dot" title="Voyage Plan">
      <ReportEmailComposer key={voyage.id} build={() => buildVoyagePlanEmail(voyage)} />
    </ReportsPageShell>
  );
}
