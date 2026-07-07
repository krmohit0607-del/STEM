import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildForecastEmail } from '../data/reports';
import { ReportsPageShell } from './ReportsTabs';
import { ReportEmailComposer } from './ReportEmailComposer';

/**
 * Forecast page — `/reports/forecast`.
 *
 * Sends the voyage forecast email, generated from the voyage's route
 * forecast data for the selected order.
 */
export function ForecastPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <ReportsPageShell active="forecast" icon="fa-cloud-sun-rain" title="Forecast">
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
    <ReportsPageShell active="forecast" icon="fa-cloud-sun-rain" title="Forecast">
      <ReportEmailComposer key={voyage.id} build={() => buildForecastEmail(voyage)} />
    </ReportsPageShell>
  );
}
