import { VOYAGES } from '../data/voyages';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useTheme } from '../theme';
import { VesselReportSubmissionDialog } from './VesselReportSubmissionDialog';

export function OfflineVesselReportsPage() {
  const selectedVoyage = useSelectedVoyage();
  const voyage = selectedVoyage ?? VOYAGES[0];
  const [theme, toggleTheme] = useTheme();

  return (
    <div className="fv-voyage fv-offline-reports">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true"><i className="fas fa-envelope" /></span>
          <div>
            <h1>Vessel Reporting Portal</h1>
            <p className="fv-voyage__sub">Submit online or prepare the same report for email when there is no internet.</p>
          </div>
        </div>
        <button
          type="button"
          className="fv-offline-reports__theme"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'bright' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'bright' : 'dark'} mode`}
        >
          <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true" />
          {theme === 'dark' ? 'Bright mode' : 'Dark mode'}
        </button>
      </header>
      <VesselReportSubmissionDialog voyage={voyage} onClose={() => undefined} mode="page" />
    </div>
  );
}