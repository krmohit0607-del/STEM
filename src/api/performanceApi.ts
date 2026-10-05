import { api, ApiError } from './client';
import type { TrackRow } from '../components/TracksheetGrid';
import type { PerformanceReport } from '../data/reports';

/** Mirrors the backend's `TracksheetRowDto` (see PerformanceController.cs). */
export type TracksheetRowApiDto = Omit<TrackRow, 'id' | 'nextPort'> & { id: string; nextPort: string };

export interface PerformanceReportApiDto {
  voyageId: string;
  vesselImo: string;
  vesselName: string;
  report: PerformanceReport;
  updatedAt: string;
}

/**
 * Client for the Performance module's API — backed by its own, physically
 * separate database (see `PerformanceDbContext`/"PerformanceConnection" on
 * the backend), independent from the main tenant database.
 */
export const performanceApi = {
  async getTracksheet(voyageId: string): Promise<TracksheetRowApiDto[]> {
    return api.get<TracksheetRowApiDto[]>(`/api/performance/tracksheet?voyageId=${encodeURIComponent(voyageId)}`);
  },

  async saveTracksheet(voyageId: string, vesselImo: string, rows: TracksheetRowApiDto[]): Promise<TracksheetRowApiDto[]> {
    return api.put<TracksheetRowApiDto[]>(`/api/performance/tracksheet?voyageId=${encodeURIComponent(voyageId)}`, {
      voyageId,
      vesselImo,
      rows,
    });
  },

  /** `null` if no report has been saved yet for this voyage (not an error). */
  async getReport(voyageId: string): Promise<PerformanceReportApiDto | null> {
    try {
      return await api.get<PerformanceReportApiDto>(`/api/performance/report?voyageId=${encodeURIComponent(voyageId)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },

  async saveReport(
    voyageId: string,
    vesselImo: string,
    vesselName: string,
    report: PerformanceReport,
  ): Promise<PerformanceReportApiDto> {
    return api.put<PerformanceReportApiDto>(`/api/performance/report?voyageId=${encodeURIComponent(voyageId)}`, {
      voyageId,
      vesselImo,
      vesselName,
      report,
    });
  },
};
