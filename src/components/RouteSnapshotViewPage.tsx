import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useL } from '../i18n/LocalizationProvider';
import {
  fetchRouteSnapshot,
  fetchHistoryWeatherGrids,
  type RouteSnapshot,
} from '../data/routeSnapshotsStore';
import type { FrozenWeatherFactor, FrozenWeatherGrid, WeatherFactorId } from '../data/routeWeatherSnapshot';
import { useVoyages } from '../data/voyages';
import { setSimWeatherHour } from '../data/routeSimulatorStore';
import { RouteSnapshotMap } from './RouteSnapshotMap';

function fmtWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) +
    'Z'
  );
}

function fmtDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  return Math.ceil(v / 5) * 5 || 1;
}

/** Linearly interpolate a `[lat, lon]` polyline at fractional `progress`
 *  (0 = start, `path.length - 1` = end). */
function samplePath(path: Array<[number, number]>, progress: number): [number, number] {
  const last = path.length - 1;
  if (last < 0) return [0, 0];
  const p = Math.max(0, Math.min(last, progress));
  const i0 = Math.floor(p);
  const i1 = Math.min(last, i0 + 1);
  const t = p - i0;
  const [lat0, lon0] = path[i0];
  const [lat1, lon1] = path[i1];
  return [lat0 * (1 - t) + lat1 * t, lon0 * (1 - t) + lon1 * t];
}

/** A small, read-only weather chart for one locked factor — same visual
 *  language as the Route Simulator's live chart, but drawn from a frozen
 *  `FrozenWeatherFactor` instead of a continuously-resampled live series. */
function FrozenWeatherChart({ factor, maxHours, cursorHours }: { factor: FrozenWeatherFactor; maxHours: number; cursorHours: number }) {
  const dataMax = factor.series.reduce(
    (m, s) => Math.max(m, ...s.points.map((p) => p.w)),
    0,
  );
  const axisMax = niceCeil(Math.max(dataMax, factor.limit) * 1.1);
  const yFor = (v: number) => 100 - Math.min(100, (v / axisMax) * 100);
  const yTicks = [0, axisMax * 0.25, axisMax * 0.5, axisMax * 0.75, axisMax].reverse();
  const cursorX = maxHours > 0 ? Math.max(0, Math.min(100, (cursorHours / maxHours) * 100)) : 0;

  return (
    <div className="fv-sim2__plot">
      <div className="fv-sim2__yaxis">
        {yTicks.map((v) => (
          <span key={v} style={{ top: `${yFor(v)}%` }}>{v.toFixed(1)}</span>
        ))}
      </div>
      <div className="fv-sim2__plot-area">
        <div className="fv-sim2__cursor" style={{ left: `${cursorX}%` }}>
          <span className="fv-sim2__cursor-grip" />
        </div>
        <svg className="fv-sim2__svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
          aria-label={factor.label}>
          <line x1="0" y1={yFor(factor.limit)} x2="100" y2={yFor(factor.limit)}
            className="fv-sim2__limit" vectorEffect="non-scaling-stroke" />
          {factor.series.map((s) => {
            const pts = s.points
              .map((p) => {
                const x = maxHours > 0 ? (p.t / maxHours) * 100 : 0;
                return `${x.toFixed(2)},${yFor(p.w).toFixed(2)}`;
              })
              .join(' ');
            return (
              <polyline key={s.id} points={pts} fill="none" stroke={s.color}
                strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * Read-only, shareable snapshot viewer (`/route-view/:id`) for a single
 * route ("View" in All Routes, weather locked at the time it was generated)
 * or a multi-route "Comparison" link (weather locked at the moment the
 * comparison was created). Everything shown here — the route lines, the
 * headline figures, and the weather chart — is exactly what was captured
 * when the link was made, never re-sampled/recomputed on open.
 */
export function RouteSnapshotViewPage() {
  const { id } = useParams<{ id: string }>();
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };
  const [snapshot, setSnapshot] = useState<RouteSnapshot | null | undefined>(undefined);
  const [weatherGrids, setWeatherGrids] = useState<Record<WeatherFactorId, FrozenWeatherGrid> | undefined>(undefined);
  const [factorId, setFactorId] = useState<WeatherFactorId>('waves');

  // Playback — drag the timeline to scrub a ship icon along every route and
  // advance the locked map weather together, same as the live Route
  // Simulator's simulation.
  const [cursorHours, setCursorHours] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(undefined);
    setWeatherGrids(undefined);
    if (!id) return;
    void fetchRouteSnapshot(id).then((s) => {
      if (cancelled) return;
      setSnapshot(s);
      if (s?.weatherGrids) {
        setWeatherGrids(s.weatherGrids);
      } else if (s?.gridSourceId) {
        // "View" snapshots fetch their (heavier) map weather grid lazily,
        // separate from the snapshot itself — see `routeSnapshotsStore.ts`.
        void fetchHistoryWeatherGrids(s.gridSourceId).then((g) => {
          if (!cancelled && g) setWeatherGrids(g);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // `useVoyages()` triggers the backend sync on mount — needed because this
  // page can be opened in a brand-new tab where the voyages list hasn't
  // been fetched yet (unlike the main app, which syncs it on login).
  const voyages = useVoyages();
  const voyage = useMemo(
    () => (snapshot?.voyageId ? voyages.find((v) => v.id === snapshot.voyageId) : undefined),
    [voyages, snapshot?.voyageId],
  );

  const maxHours = useMemo(
    () => (snapshot ? snapshot.routes.reduce((m, r) => Math.max(m, r.durationH), 0) : 0),
    [snapshot],
  );
  const factor = snapshot?.weather.find((w) => w.factorId === factorId);

  // Drive the map's weather-overlay hour together with the scrub cursor,
  // and release control back to the map's own manual slider on unmount.
  useEffect(() => {
    setSimWeatherHour(cursorHours);
    return () => setSimWeatherHour(null);
  }, [cursorHours]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      return;
    }
    const step = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dtHours = ((ts - lastTsRef.current) / 1000) * (maxHours / 30 || 1); // ~30s full transit
      lastTsRef.current = ts;
      setCursorHours((prev) => {
        const next = prev + dtHours;
        if (next >= maxHours) {
          setPlaying(false);
          return maxHours;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, maxHours]);

  const shipPositions = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.routes
      .filter((r) => r.path.length >= 2)
      .map((r) => {
        const frac = r.durationH > 0 ? Math.min(1, cursorHours / r.durationH) : 0;
        return { id: r.id, pos: samplePath(r.path, frac * (r.path.length - 1)), color: r.color };
      });
  }, [snapshot, cursorHours]);

  if (snapshot === undefined) {
    return (
      <div className="fv-snapshot fv-snapshot--loading">
        <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {t('loading', 'Loading…')}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="fv-snapshot fv-snapshot--loading">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
        {t('snapshotNotFound', 'This link could not be found — it may have expired or the URL is incorrect.')}
      </div>
    );
  }

  return (
    <div className="fv-snapshot">
      <header className="fv-snapshot__head">
        <h1>
          <i className={`fas ${snapshot.kind === 'comparison' ? 'fa-code-compare' : 'fa-eye'}`} aria-hidden="true" />{' '}
          {snapshot.title}
        </h1>
        {voyage && (
          <p className="fv-snapshot__vessel">
            <i className="fas fa-ship" aria-hidden="true" /> <strong>{voyage.vessel}</strong>
            <span className="fv-snapshot__voyage-ports">
              {voyage.portFrom} <i className="fas fa-arrow-right" aria-hidden="true" /> {voyage.portTo}
            </span>
          </p>
        )}
        <p className="fv-snapshot__lock-note">
          <i className="fas fa-lock" aria-hidden="true" />{' '}
          {t('lockedWeatherNote', 'Routes, results, and weather are locked as they were on')}{' '}
          <strong>{fmtWhen(snapshot.createdAt)}</strong> — {t('notLive', 'not updated since.')}
        </p>
      </header>

      <div className="fv-snapshot__map">
        <RouteSnapshotMap routes={snapshot.routes} weatherGrids={weatherGrids} shipPositions={shipPositions} />
      </div>

      <div className="fv-snapshot__playback">
        <button
          type="button"
          className="fv-snapshot__play-btn"
          onClick={() => setPlaying((p) => !p)}
          disabled={maxHours <= 0}
          aria-label={playing ? t('pause', 'Pause') : t('play', 'Play')}
        >
          <i className={`fas ${playing ? 'fa-pause' : 'fa-play'}`} aria-hidden="true" />
        </button>
        <input
          type="range"
          className="fv-snapshot__scrub"
          min={0}
          max={maxHours || 1}
          step={maxHours > 0 ? maxHours / 500 : 1}
          value={cursorHours}
          onChange={(e) => setCursorHours(Number(e.target.value))}
        />
        <span className="fv-snapshot__scrub-label">{fmtDuration(cursorHours)} / {fmtDuration(maxHours)}</span>
      </div>

      <div className="fv-sim2">
        <div className="fv-sim2__table-wrap">
          <table className="fv-sim2__table">
            <thead>
              <tr>
                <th className="fv-sim2__col-name">{t('route', 'Route')}</th>
                <th>{t('etd', 'ETD')}</th>
                <th>{t('eta', 'ETA')}</th>
                <th>{t('distanceNm', 'Distance (NM)')}</th>
                <th>{t('averageSpeedKnots', 'Average Speed (knots)')}</th>
                <th>{t('timeToGo', 'Duration')}</th>
                <th>{t('ecaDistanceNm', 'ECA Distance (NM)')}</th>
                <th>{t('ecaTimeToGo', 'ECA Time')}</th>
                <th>{t('meFuelRequiredToGo', 'M/E Fuel (MT)')}</th>
                <th>{t('totalCostToGo', 'Total Cost (USD)')}</th>
                <th>{t('fuelCostToGo', 'Fuel Cost (USD)')}</th>
                <th>{t('timeCostToGo', 'Time Cost (USD)')}</th>
                <th>{t('emissionsCostToGo', 'Emissions Cost (USD)')}</th>
                <th>{t('ecaFuelRequiredToGo', 'ECA Fuel (MT)')}</th>
                <th>{t('meCo2EmissionsToGo', 'M/E CO2 (MT)')}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.routes.map((r) => (
                <tr key={r.id}>
                  <td className="fv-sim2__col-name">
                    <span className="fv-sim2__swatch" style={{ background: r.color }} aria-hidden="true" />
                    {r.label}
                  </td>
                  <td>{fmtWhen(r.etdIso)}</td>
                  <td>{fmtWhen(r.etaIso)}</td>
                  <td>{Math.round(r.distanceNm).toLocaleString()} {t('nmUnit', 'NM')}</td>
                  <td>{(r.speedKn ?? 0).toFixed(1)} kn</td>
                  <td>{fmtDuration(r.durationH)}</td>
                  <td>{Math.round(r.ecaDistanceNm).toLocaleString()} {t('nmUnit', 'NM')}</td>
                  <td>{fmtDuration(r.ecaDurationH)}</td>
                  <td>{Math.round(r.fuelTons).toLocaleString()} MT</td>
                  <td>US${Math.round(r.totalCost).toLocaleString()}</td>
                  <td>US${Math.round(r.fuelCost).toLocaleString()}</td>
                  <td>US${Math.round(r.hireCost).toLocaleString()}</td>
                  <td>US${Math.round(r.euaCost).toLocaleString()}</td>
                  <td>{Math.round(r.ecaFuelTons).toLocaleString()} MT</td>
                  <td>{Math.round(r.co2Tons).toLocaleString()} MT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {factor && (
          <div className="fv-sim2__chart">
            <div className="fv-sim2__chart-head">
              <label className="fv-sim2__factor-select">
                <select value={factorId} onChange={(e) => setFactorId(e.target.value as WeatherFactorId)}>
                  {snapshot.weather.map((f) => (
                    <option key={f.factorId} value={f.factorId}>
                      {t(`weatherFactor.${f.factorId}`, f.label)} ({f.unit})
                    </option>
                  ))}
                </select>
                <i className="fas fa-chevron-down" aria-hidden="true" />
              </label>
              <span className="fv-sim2__live">
                <i className="fas fa-lock" aria-hidden="true" /> {t('lockedWeather', 'Locked weather')}
              </span>
            </div>
            <FrozenWeatherChart factor={factor} maxHours={maxHours} cursorHours={cursorHours} />
            <div className="fv-snapshot__legend">
              {snapshot.routes.map((r) => (
                <span key={r.id} className="fv-snapshot__legend-item">
                  <span className="fv-sim2__swatch" style={{ background: r.color }} aria-hidden="true" />
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
