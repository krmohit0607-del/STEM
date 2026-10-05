import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { STUB_ROWS as TRACKSHEET_ROWS } from './TracksheetGrid';
import { PerformanceReportsTable } from './InterimDashboardPage';
import { vesselReportsApi, type VesselReportDto } from '../api/vesselReportsApi';

export function VesselReportsPage() {
  const voyage = useSelectedVoyage();
  const [reports, setReports] = useState<VesselReportDto[]>([]);

  useEffect(() => {
    if (!voyage) return;
    void (async () => {
      try {
        const list = await vesselReportsApi.getReports(voyage.imo, voyage.id);
        if (list && list.length > 0) setReports(list);
      } catch {
        /* fallback */
      }
    })();
  }, [voyage?.imo, voyage?.id]);

  const mappedRows = reports.length > 0
    ? reports.map((r, index) => {
        const base = TRACKSHEET_ROWS[index % TRACKSHEET_ROWS.length] ?? TRACKSHEET_ROWS[0];
        return {
          ...base,
          id: r.id || `vessel-report-${index}`,
          rt: r.reportType.slice(0, 1).toUpperCase(),
          date: new Date(r.reportDateTime).toLocaleDateString(),
          time: new Date(r.reportDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          lat: r.latitude || base.lat,
          lng: r.longitude || base.lng,
          hrs: r.steamingHours ?? base.hrs,
          avgSpeedO: r.speedObserved ?? base.avgSpeedO,
          vlsfoRob: r.vlsfoRob ?? base.vlsfoRob,
          lsmgoRob: r.lsmgoRob ?? base.lsmgoRob,
          nextPort: r.nextPort || '',
        };
      })
    : TRACKSHEET_ROWS.map((row, index) => ({
        ...row,
        id: `vessel-report-${index}`,
        nextPort: '',
      }));

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

      <PerformanceReportsTable rows={mappedRows} />
    </div>
  );
}