import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { VOYAGES, type Voyage } from '../data/voyages';
import { getPerformanceReport, type PerformanceReport } from '../data/reports';
import { performanceApi } from '../api/performanceApi';
import { STUB_ROWS } from './TracksheetGrid';

function asNumber(value: string): number {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

export function VesselMasterPerformancePage() {
  const { user, companyName } = useAuth();
  const navigate = useNavigate();

  // Find voyages relevant to the Master's assigned vessel (or fallback to active voyages)
  const vesselName = user?.assignedVesselName ?? 'MV OCEANIC PIONEER';
  const vesselImo = user?.assignedVesselImo ?? '9417878';

  const vesselVoyages = useMemo(() => {
    const list = VOYAGES.filter(
      (v) =>
        v.vessel.toLowerCase().includes(vesselName.toLowerCase()) ||
        v.vessel.toLowerCase().includes('oceanic') ||
        v.vessel.toLowerCase().includes('atlantic'),
    );
    return list.length > 0 ? list : VOYAGES.slice(0, 3);
  }, [vesselName]);

  const [selectedVoyage, setSelectedVoyage] = useState<Voyage>(vesselVoyages[0] ?? VOYAGES[0]);

  const [report, setReport] = useState<PerformanceReport>(() => getPerformanceReport(selectedVoyage));

  // Generated/stub report first (instant), then swapped for the saved one
  // from the Performance module's own backend/database if it has one —
  // same source of truth as the editable Performance Report page.
  useEffect(() => {
    setReport(getPerformanceReport(selectedVoyage));
    let cancelled = false;
    void (async () => {
      try {
        const saved = await performanceApi.getReport(selectedVoyage.id);
        if (!cancelled && saved) setReport(saved.report);
      } catch {
        /* keep the generated report on failure — backend may be offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedVoyage]);

  // Calculations
  const totalSeaHrs = useMemo(() => {
    return report.summary.reduce((acc, row) => acc + asNumber(row.timeAtSea), 0).toFixed(1);
  }, [report]);

  const totalVlsfo = useMemo(() => {
    return report.summary.reduce((acc, row) => acc + asNumber(row.vlsfoCons), 0).toFixed(2);
  }, [report]);

  const totalLsmgo = useMemo(() => {
    return report.summary.reduce((acc, row) => acc + asNumber(row.lsmgoCons), 0).toFixed(2);
  }, [report]);

  return (
    <div className="fv-shell" style={{ padding: '2rem', maxWidth: '1280px', margin: '0 auto', color: '#f8fafc' }}>
      {/* Header Banner */}
      <header
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '1.5rem 2rem',
          borderRadius: '10px',
          border: '1px solid #334155',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span
              style={{
                background: '#0284c7',
                color: '#fff',
                padding: '0.2rem 0.6rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                letterSpacing: '0.05em',
              }}
            >
              <i className="fas fa-ship" style={{ marginRight: '4px' }} /> VESSEL MASTER
            </span>
            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              IMO: <strong style={{ color: '#38bdf8' }}>{vesselImo}</strong>
            </span>
            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              Owner/Tenant: <strong style={{ color: '#f8fafc' }}>{companyName ?? 'Acme Shipping & Logistics'}</strong>
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 700, color: '#fff' }}>
            {vesselName} — Master Command &amp; Performance
          </h1>
          <p style={{ margin: '0.35rem 0 0 0', color: '#94a3b8', fontSize: '0.95rem' }}>
            Logged in as <strong>{user?.fullName ?? 'Capt. Edward Smith'}</strong> · Master Bridge Telemetry &amp; Fuel Analytics
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => navigate(`/vessel-reports?imo=${encodeURIComponent(vesselImo)}`)}
            style={{
              background: '#059669',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1.2rem',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <i className="fas fa-clipboard-list" /> Submit Noon Report
          </button>
          <button
            type="button"
            onClick={() => navigate(`/vessel-reports/offline`)}
            style={{
              background: '#334155',
              color: '#fff',
              border: '1px solid #475569',
              padding: '0.6rem 1rem',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <i className="fas fa-wifi" /> Offline Mode
          </button>
        </div>
      </header>

      {/* Voyage Selector & Status Ribbon */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '1rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>Active Voyage:</label>
          <select
            value={selectedVoyage.id}
            onChange={(e) => {
              const match = vesselVoyages.find((v) => v.id === e.target.value);
              if (match) setSelectedVoyage(match);
            }}
            style={{
              background: '#0f172a',
              color: '#fff',
              border: '1px solid #334155',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            {vesselVoyages.map((v) => (
              <option key={v.id} value={v.id}>
                Voyage #{v.id}: {v.portFrom} → {v.portTo} ({v.status})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
          <div>
            <span style={{ color: '#94a3b8' }}>Departure: </span>
            <strong style={{ color: '#fff' }}>{selectedVoyage.portFrom}</strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>Destination: </span>
            <strong style={{ color: '#38bdf8' }}>{selectedVoyage.portTo}</strong>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>ETA: </span>
            <strong style={{ color: '#86efac' }}>{selectedVoyage.eta || 'On Schedule'}</strong>
          </div>
        </div>
      </div>

      {/* Real-Time Telemetry & Performance KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem' }}>
            <span>CP / INST SPEED</span>
            <i className="fas fa-gauge-high" style={{ color: '#38bdf8' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem', color: '#fff' }}>
            {selectedVoyage.instSpeed?.toFixed(1) ?? '13.5'} <small style={{ fontSize: '0.9rem', fontWeight: 400, color: '#94a3b8' }}>kts</small>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#86efac', marginTop: '0.25rem' }}>
            <i className="fas fa-arrow-trend-up" /> Warranted CP Speed: {selectedVoyage.cpSpeed || 13.0} kts
          </div>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem' }}>
            <span>TIME AT SEA</span>
            <i className="fas fa-clock" style={{ color: '#a78bfa' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem', color: '#fff' }}>
            {totalSeaHrs} <small style={{ fontSize: '0.9rem', fontWeight: 400, color: '#94a3b8' }}>hrs</small>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Calculated from noon reports
          </div>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem' }}>
            <span>VLSFO CONSUMED</span>
            <i className="fas fa-gas-pump" style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem', color: '#fff' }}>
            {totalVlsfo} <small style={{ fontSize: '0.9rem', fontWeight: 400, color: '#94a3b8' }}>MT</small>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '0.25rem' }}>
            ROB: ~{STUB_ROWS[STUB_ROWS.length - 1]?.vlsfoRob?.toFixed(1) ?? '412.0'} MT
          </div>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem' }}>
            <span>LSMGO CONSUMED</span>
            <i className="fas fa-oil-can" style={{ color: '#ec4899' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem', color: '#fff' }}>
            {totalLsmgo} <small style={{ fontSize: '0.9rem', fontWeight: 400, color: '#94a3b8' }}>MT</small>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#f472b6', marginTop: '0.25rem' }}>
            ROB: ~{STUB_ROWS[STUB_ROWS.length - 1]?.lsmgoRob?.toFixed(1) ?? '98.5'} MT
          </div>
        </div>
      </div>

      {/* Abstract & Detailed Noon Log Entries */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#38bdf8' }}>
            <i className="fas fa-list-check" style={{ marginRight: '0.5rem' }} /> Noon Telemetry &amp; Abstract Log History
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Showing latest {STUB_ROWS.length} logged waypoints
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Event / Code</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date &amp; Time</th>
                <th style={{ padding: '0.75rem 1rem' }}>Coordinates</th>
                <th style={{ padding: '0.75rem 1rem' }}>Dist (NM)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Avg Spd</th>
                <th style={{ padding: '0.75rem 1rem' }}>VLSFO ROB</th>
                <th style={{ padding: '0.75rem 1rem' }}>LSMGO ROB</th>
              </tr>
            </thead>
            <tbody>
              {STUB_ROWS.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    <span
                      style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        fontSize: '0.75rem',
                        background: idx === 0 ? '#2563eb' : idx === STUB_ROWS.length - 1 ? '#059669' : '#334155',
                        color: '#fff',
                      }}
                    >
                      {idx === 0 ? 'DEP' : idx === STUB_ROWS.length - 1 ? 'ARR' : row.rt || 'NOON'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{row.date} {row.time}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#38bdf8' }}>{row.lat}° / {row.lng}°</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{row.distR?.toFixed(1) ?? '—'} nm</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#86efac', fontWeight: 600 }}>{row.avgSpeedO?.toFixed(1) ?? '—'} kts</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{row.vlsfoRob?.toFixed(1) ?? '—'} MT</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{row.lsmgoRob?.toFixed(1) ?? '—'} MT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
