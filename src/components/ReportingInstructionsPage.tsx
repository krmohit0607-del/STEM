import { useSelectedVoyage } from '../data/selectedVoyage';
import { buildReportingInstructions } from '../data/reports';
import { ReportsPageShell } from './ReportsTabs';
import { ReportEmailComposer } from './ReportEmailComposer';

/**
 * Reporting Instructions page — `/reports/instructions`.
 *
 * Pre-voyage appointment + reporting instructions email to the Master.
 */
export function ReportingInstructionsPage() {
  const voyage = useSelectedVoyage();

  if (!voyage) {
    return (
      <ReportsPageShell active="instructions" icon="fa-file-lines" title="Reporting Instructions">
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
    <ReportsPageShell active="instructions" icon="fa-file-lines" title="Reporting Instructions">
      <ReportEmailComposer key={voyage.id} build={() => buildReportingInstructions(voyage)} />
    </ReportsPageShell>
  );
}
