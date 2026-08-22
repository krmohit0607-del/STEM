import { Link } from 'react-router-dom';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { STUB_ROWS as TRACKSHEET_ROWS } from './TracksheetGrid';
import { PerformanceReportsTable } from './InterimDashboardPage';

export function VesselReportsPage() {
  const voyage = useSelectedVoyage();

  return (
    <div className="fv-interim">
      <header className="fv-voyage__header">
        <div className="fv-voyage__heading">
          <span className="fv-voyage__heading-icon" aria-hidden="true">
            <i className="fas fa-file-arrow-up" />
          </span>
          <div>
            <h1>Vessel Reports</h1>
            <p className="fv-voyage__sub">
              {voyage
                ? `${voyage.vessel} · IMO ${voyage.imo} · ${voyage.client} · ${voyage.portFrom} → ${voyage.portTo}`
                : 'No voyage selected'}
            </p>
          </div>
        </div>
        <Link
          className="fv-report__btn fv-report__btn--primary"
          to="/vessel-reports/offline"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className="fas fa-file-arrow-up" aria-hidden="true" /> Submit Vessel Report
        </Link>
      </header>

      <PerformanceReportsTable
        rows={TRACKSHEET_ROWS.map((row, index) => ({
          ...row,
          id: `vessel-report-${index}`,
          nextPort: '',
        }))}
      />
    </div>
  );
}