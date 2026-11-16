import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  optimizationApi,
  type OptimizationCheckResultApiDto,
  type OptimizationRecommendationApiDto,
  type PerformanceCalibrationApiDto,
  type PerformanceComparisonApiDto,
} from '../api/optimizationApi';
import { buildOperatingProfiles } from '../data/optimizationProfiles';
import { useSelectedLegNo } from '../data/selectedLeg';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { imoForVoyage, useVessels } from '../data/vessels';
import type { OptimizedRoute } from '../data/routeMetrics';

type Tab = 'analysis' | 'segments' | 'suggestions' | 'performance' | 'calibration';

const fmtUtc = (iso?: string | null) => {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '\u2014' : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};
const num = (value: number | null | undefined, digits = 1, unit = '') =>
  value == null || !Number.isFinite(value) ? '\u2014' : `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
const signed = (value: number | null | undefined, digits = 1, unit = '') =>
  value == null || !Number.isFinite(value) ? '\u2014' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fv-optins__row">
      <span className="fv-optins__label">{label}</span>
      <span className="fv-optins__value">{children}</span>
    </div>
  );
}

function AnalysisTab({ route }: { route?: OptimizedRoute | null }) {
  const a = route?.analysis;
  if (!route || !a) {
    return <p className="fv-optins__empty">Select an optimized route in the routes table, then reopen this window, to see its analysis.</p>;
  }
  return (
    <div className="fv-optins__grid">
      <div className="fv-optins__block">
        <h6>Basis and ETA</h6>
        <Row label="Performance basis">
          {a.performanceBasis === 'ACTUAL' ? 'Observed noon-report performance' : 'Configured CP (paper) Speed & Cons'}
        </Row>
        {a.performanceModel && <p className="fv-optins__note">{a.performanceModel}</p>}
        {a.calibrationApplied && <p className="fv-optins__note">{a.calibrationApplied}</p>}
        <Row label="ETA (forecast speed)">{fmtUtc(a.etaEarliestUtc)}</Row>
        <Row label="Latest ETA (weather margin)">{fmtUtc(a.etaLatestUtc)}</Row>
        {a.etaRangeBasis && <p className="fv-optins__note">{a.etaRangeBasis}</p>}
        <Row label="Weather delay vs calm water">{num(a.weatherDelayHours, 1, 'h')}</Row>
        <Row label="Forecast fetched">{fmtUtc(a.forecastFetchedAtUtc)}</Row>
      </div>

      <div className="fv-optins__block">
        <h6>Ranking</h6>
        <Row label="Pareto rank">
          {a.paretoRank > 0 ? `${a.paretoRank}${a.isParetoOptimal ? ' (Pareto-optimal)' : ''}` : '\u2014'}
        </Row>
        <Row label="Weighted score (0 = best)">{num(a.rankingScore, 3)}</Row>
        {a.rankingExplanation && <p className="fv-optins__note">{a.rankingExplanation}</p>}
      </div>

      <div className="fv-optins__block">
        <h6>Engine and sea state</h6>
        <Row label="Peak engine load">{a.maxEngineLoadPct ? num(a.maxEngineLoadPct, 0, '%') : '\u2014'}</Row>
        <Row label="Hours using extra power">{num(a.hoursPowerBoosted, 1, 'h')}</Row>
        <Row label="Hours above vessel weather limit">{num(a.hoursOverVesselWeatherLimit, 1, 'h')}</Row>
        <Row label="Synchronous / parametric roll risk">
          {num(a.hoursSynchronousRollRisk, 1, 'h')} / {num(a.hoursParametricRollRisk, 1, 'h')}
        </Row>
        <Row label="Pitch resonance risk">{num(a.hoursPitchResonanceRisk, 1, 'h')}</Row>
      </div>

      <div className="fv-optins__block">
        <h6>Bunkers</h6>
        <Row label="ROB at start (VLSFO / LSMGO)">
          {num(a.startRobVlsfoMt, 1, 'MT')} / {num(a.startRobLsmgoMt, 1, 'MT')}
        </Row>
        <Row label="ROB at arrival (VLSFO / LSMGO)">
          {num(a.arrivalRobVlsfoMt, 1, 'MT')} / {num(a.arrivalRobLsmgoMt, 1, 'MT')}
        </Row>
        <Row label="Reserve kept">{a.reserveSatisfied == null ? '\u2014' : a.reserveSatisfied ? 'Yes' : 'No'}</Row>
        {a.suppliesApplied.length > 0 && <p className="fv-optins__note">Confirmed supplies used: {a.suppliesApplied.join('; ')}</p>}
        {a.suppliesNotCounted.length > 0 && <p className="fv-optins__note">Not counted: {a.suppliesNotCounted.join('; ')}</p>}
      </div>

      <div className="fv-optins__block">
        <h6>Solver</h6>
        <Row label="Status">{a.solver.status === 'TimeLimitReached' ? 'Time limit reached (best coarse route)' : a.solver.status}</Row>
        <Row label="Time (coarse / detailed)">
          {(a.solver.stage1ElapsedMs / 1000).toFixed(1)} s / {(a.solver.stage2ElapsedMs / 1000).toFixed(1)} s of {a.solver.timeLimitSeconds} s
        </Row>
        <Row label="Segment evaluations">{a.solver.segmentEvaluations.toLocaleString()}</Row>
        <Row label="Settings tried (coarse / detailed)">{a.solver.stage1Settings} / {a.solver.stage2Settings}</Row>
        <Row label="Waiting steps in route">{a.solver.waitingStepsInRoute}</Row>
        {a.solver.notes.map((n, i) => <p key={i} className="fv-optins__note">{n}</p>)}
      </div>

      {a.savings && (
        <div className="fv-optins__block">
          <h6>Savings vs planned route</h6>
          <Row label="Fuel saved">{signed(a.savings.fuelSavedMt, 1, 'MT')}</Row>
          <Row label="Cost saved">{`${a.savings.costSavedUsd > 0 ? '+' : ''}${Math.round(a.savings.costSavedUsd).toLocaleString()} USD`}</Row>
          <Row label="Time saved">{signed(a.savings.timeSavedHours, 1, 'h')}</Row>
          <Row label="CO₂ saved">{signed(a.savings.co2SavedMt, 1, 'MT')}</Row>
          <p className="fv-optins__note">{a.savings.baseline} Planned ETA {fmtUtc(a.savings.baselineEtaUtc)}.</p>
        </div>
      )}

      {(a.fuelByGrade.length > 0 || a.emissions) && (
        <div className="fv-optins__block">
          <h6>Fuel and emissions</h6>
          {a.fuelByGrade.map((g) => (
            <Row key={g.grade} label={g.grade}>
              {num(g.mt, 1, 'MT')} · {num(g.co2Mt, 1, 'MT CO₂')} · {Math.round(g.costUsd).toLocaleString()} USD
            </Row>
          ))}
          {a.emissions && (
            <>
              <Row label="Voyage type">{a.emissions.voyageClassification} ({num(a.emissions.coveragePct, 0, '%')} covered)</Row>
              <Row label="Chargeable CO₂">{num(a.emissions.chargeableCo2Mt, 1, 'MT')} of {num(a.emissions.totalCo2Mt, 1, 'MT')}</Row>
              <p className="fv-optins__note">{a.emissions.basis}</p>
            </>
          )}
        </div>
      )}

      {a.uncertainty && (
        <div className="fv-optins__block">
          <h6>Wind uncertainty (partial)</h6>
          {a.uncertainty.members > 0 ? (
            <>
              <Row label="Members">{a.uncertainty.members} ({a.uncertainty.source})</Row>
              <Row label="ETA P10 / P50 / P90">
                {fmtUtc(a.uncertainty.etaP10Utc)} / {fmtUtc(a.uncertainty.etaP50Utc)} / {fmtUtc(a.uncertainty.etaP90Utc)}
              </Row>
              <Row label="Fuel P10 / P50 / P90">
                {num(a.uncertainty.fuelP10Mt, 0)} / {num(a.uncertainty.fuelP50Mt, 0)} / {num(a.uncertainty.fuelP90Mt, 0)} MT
              </Row>
              <Row label="Cost P10 / P50 / P90">
                {Math.round(a.uncertainty.costP10Usd).toLocaleString()} / {Math.round(a.uncertainty.costP50Usd).toLocaleString()} / {Math.round(a.uncertainty.costP90Usd).toLocaleString()} USD
              </Row>
              {a.uncertainty.probabilityMissTargetEta != null && (
                <Row label="Chance of missing target ETA">{num(a.uncertainty.probabilityMissTargetEta * 100, 0, '%')}</Row>
              )}
              {a.uncertainty.probabilityReserveShortfall != null && (
                <Row label="Chance of reserve shortfall">{num(a.uncertainty.probabilityReserveShortfall * 100, 0, '%')}</Row>
              )}
            </>
          ) : null}
          {a.uncertainty.notes.map((n, i) => <p key={i} className="fv-optins__note">{n}</p>)}
        </div>
      )}

      {a.bunkerPortOptions.length > 0 && (
        <div className="fv-optins__block fv-optins__block--wide">
          <h6>Alternative bunker ports (by detour cost)</h6>
          <table className="fv-optins__table">
            <thead>
              <tr>
                <th>Port</th>
                <th>Off route (NM)</th>
                <th>Detour (NM)</th>
                <th>Extra time (h)</th>
                <th>Extra fuel (MT)</th>
                <th>Extra cost (USD)</th>
                <th>Nearest point ETA</th>
                <th>Booked stem</th>
              </tr>
            </thead>
            <tbody>
              {a.bunkerPortOptions.map((p) => (
                <tr key={`${p.port}-${p.lat}`}>
                  <td>{p.port}{p.country ? `, ${p.country}` : ''}</td>
                  <td>{num(p.distanceOffRouteNm, 0)}</td>
                  <td>{num(p.extraDistanceNm, 0)}</td>
                  <td>{num(p.extraHours, 1)}</td>
                  <td>{num(p.extraFuelMt, 1)}</td>
                  <td>{Math.round(p.extraCostUsd).toLocaleString()}</td>
                  <td>{fmtUtc(p.etaAtClosestPointUtc)}</td>
                  <td>{p.hasBookedSupply ? 'Yes' : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {a.bunkerPortBasis && <p className="fv-optins__note">{a.bunkerPortBasis}</p>}
        </div>
      )}

      {route.warnings && route.warnings.length > 0 && (
        <div className="fv-optins__block fv-optins__block--wide">
          <h6>Notes and warnings</h6>
          <ul className="fv-optins__list">
            {route.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SegmentsTab({ route }: { route?: OptimizedRoute | null }) {
  const rows = route?.analysis?.segments ?? [];
  if (!route?.analysis || rows.length === 0) {
    return <p className="fv-optins__empty">Select an optimized route in the routes table, then reopen this window, to see its segment-by-segment calculation.</p>;
  }
  return (
    <div>
      <p className="fv-optins__note">
        Every sailed sub-step (forecast sampled at its own position and time) and every wait, in order. Totals reconcile with the route table.
      </p>
      <table className="fv-optins__table">
        <thead>
          <tr>
            <th>#</th><th>Start (UTC)</th><th>Hours</th><th>NM</th><th>STW / SOG (kn)</th><th>Setting</th><th>RPM</th><th>kW</th><th>Load</th>
            <th>M/E fuel (MT)</th><th>Aux (MT)</th><th>CO₂ / chargeable (MT)</th><th>Wind (kn/°)</th><th>Wave (m)</th><th>Current (kn)</th>
            <th>ECA</th><th>ROB VLSFO / LSMGO</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.index} className={r.kind === 'Wait' ? 'fv-optins__wait' : undefined}>
              <td>{r.index + 1}</td>
              <td>{fmtUtc(r.startUtc)}</td>
              <td>{num(r.hours, 1)}</td>
              <td>{r.kind === 'Wait' ? '\u2014' : num(r.distanceNm, 0)}</td>
              <td>{r.kind === 'Wait' ? 'waiting' : `${num(r.stwKn, 1)} / ${num(r.sogKn, 1)}`}</td>
              <td>{r.setting}{r.powerMode === 'Boost' ? ' (boost)' : ''}</td>
              <td>{num(r.rpm, 0)}</td>
              <td>{num(r.powerKw, 0)}</td>
              <td>{r.loadPct != null ? num(r.loadPct, 0, '%') : '\u2014'}</td>
              <td>{num(r.mainEngineFuelMt, 2)} {r.mainEngineGrade}</td>
              <td>{num(r.auxFuelMt, 2)}</td>
              <td>{num(r.co2Mt, 1)} / {num(r.chargeableCo2Mt, 1)}</td>
              <td>{r.kind === 'Wait' ? '\u2014' : `${num(r.windKn, 0)}/${num(r.windFromDeg, 0)}`}</td>
              <td>{r.kind === 'Wait' ? '\u2014' : num(r.waveM, 1)}</td>
              <td>{r.kind === 'Wait' ? '\u2014' : num(r.currentKn, 1)}</td>
              <td>{r.inEca ? 'Yes' : '\u2014'}</td>
              <td>{num(r.robVlsfoEndMt, 0)} / {num(r.robLsmgoEndMt, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalibrationTab() {
  const voyage = useSelectedVoyage();
  const legNo = useSelectedLegNo();
  const imo = imoForVoyage(voyage, useVessels());
  const { loadCondition, profiles } = buildOperatingProfiles(voyage, legNo);
  const [items, setItems] = useState<PerformanceCalibrationApiDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!imo) return;
    try {
      setItems(await optimizationApi.getCalibrations(imo));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load calibrations.');
    }
  }, [imo]);

  useEffect(() => { void load(); }, [load]);

  if (!imo) return <p className="fv-optins__empty">Select a voyage with a registered vessel IMO.</p>;

  const fit = async () => {
    setBusy(true);
    setError('');
    try {
      await optimizationApi.fitCalibration({ vesselImo: imo, loadCondition, operatingProfiles: profiles });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The fit could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, approve: boolean) => {
    try {
      if (approve) await optimizationApi.approveCalibration(id);
      else await optimizationApi.rejectCalibration(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the calibration.');
    }
  };

  return (
    <div>
      <div className="fv-optins__actions">
        <button type="button" className="fv-optins__btn" onClick={fit} disabled={busy || profiles.length < 2}>
          <i className="fas fa-chart-line" aria-hidden="true" /> {busy ? 'Fitting\u2026' : `Fit from noon reports (${loadCondition}, selected leg's Speed & Cons)`}
        </button>
        <span className="fv-optins__note">
          A fit is only a proposal. After an administrator approves it, configured (CP) fuel and power are scaled by its factor in new runs; nothing is overwritten and earlier runs keep their results.
        </span>
      </div>
      {profiles.length < 2 && <p className="fv-optins__note">At least two saved Speed & Cons rows are needed for the selected leg.</p>}
      {error && <p className="fv-optins__error" role="alert">{error}</p>}
      {items.length === 0 ? (
        <p className="fv-optins__empty">No calibrations for this vessel yet.</p>
      ) : (
        <table className="fv-optins__table">
          <thead>
            <tr><th>Fitted</th><th>Load</th><th>Fuel factor</th><th>Spread</th><th>Drift / month</th><th>Reports used</th><th>Quality</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{fmtUtc(c.fittedAtUtc)}</td>
                <td>{c.loadCondition}</td>
                <td>{c.fuelFactor.toFixed(3)}</td>
                <td>{num(c.spreadPct, 1, '%')}</td>
                <td>{c.trendPctPerMonth != null ? signed(c.trendPctPerMonth, 2, '%') : '\u2014'}</td>
                <td>{c.usedSampleCount} of {c.sampleCount}</td>
                <td title={c.notes.join(' ')}>{c.quality}</td>
                <td>{c.status}</td>
                <td>
                  {c.status === 'Proposed' && (
                    <>
                      <button type="button" className="fv-optins__btn" onClick={() => void review(c.id, true)}>Approve</button>{' '}
                      <button type="button" className="fv-optins__btn" onClick={() => void review(c.id, false)}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {items[0]?.notes.map((n, i) => <p key={i} className="fv-optins__note">{n}</p>)}
    </div>
  );
}

function SuggestionsTab({ voyageId }: { voyageId: string }) {
  const [items, setItems] = useState<OptimizationRecommendationApiDto[]>([]);
  const [check, setCheck] = useState<OptimizationCheckResultApiDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await optimizationApi.getRecommendations(voyageId));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load suggestions.');
    }
  }, [voyageId]);

  useEffect(() => { void load(); }, [load]);

  const runCheck = async () => {
    setBusy(true);
    setCheck(null);
    try {
      setCheck(await optimizationApi.checkVoyage(voyageId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The check could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (id: string, confirm: boolean) => {
    try {
      if (confirm) await optimizationApi.confirmRecommendation(id);
      else await optimizationApi.dismissRecommendation(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the suggestion.');
    }
  };

  return (
    <div>
      <div className="fv-optins__actions">
        <button type="button" className="fv-optins__btn" onClick={runCheck} disabled={busy}>
          <i className="fas fa-rotate" aria-hidden="true" /> {busy ? 'Checking\u2026' : 'Check latest report against the plan'}
        </button>
        <span className="fv-optins__note">
          Suggestions never change a route. Confirming one means you will run Optimize again; the original run stays in history.
        </span>
      </div>
      {error && <p className="fv-optins__error" role="alert">{error}</p>}
      {check && (
        <p className="fv-optins__note">
          {check.reoptimizeRecommended
            ? `Drift found (${check.source}): ${check.reasons.join(' ')}`
            : `No re-optimization needed (${check.source || 'no usable report'}).${check.notes.length ? ` ${check.notes.join(' ')}` : ''}`}
          {check.recommendationAction === 'suppressed' ? ' A recent suggestion was already handled, so no new one was raised.' : ''}
        </p>
      )}
      {items.length === 0 ? (
        <p className="fv-optins__empty">No suggestions for this voyage.</p>
      ) : (
        <table className="fv-optins__table">
          <thead>
            <tr><th>Raised</th><th>Status</th><th>Reasons</th><th /></tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{fmtUtc(r.createdAtUtc)}</td>
                <td>{r.status}</td>
                <td className="fv-optins__left">{r.reasons.join(' ')}</td>
                <td>
                  {r.status === 'Pending' && (
                    <>
                      <button type="button" className="fv-optins__btn" onClick={() => void resolve(r.id, true)}>Confirm</button>{' '}
                      <button type="button" className="fv-optins__btn" onClick={() => void resolve(r.id, false)}>Dismiss</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PerformanceTab({ voyageId, route }: { voyageId: string; route?: OptimizedRoute | null }) {
  const [data, setData] = useState<PerformanceComparisonApiDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const runId = route?.runId;
  const scenario = route?.scenarioId;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const id = runId ?? (await optimizationApi.getRuns(voyageId))[0]?.optimizationRunId;
        if (!id) {
          if (alive) { setData(null); setError('This voyage has no optimization run yet.'); }
          return;
        }
        const result = await optimizationApi.getPerformanceComparison(id, runId ? scenario : undefined);
        if (alive) setData(result);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the comparison.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [voyageId, runId, scenario]);

  if (loading) return <p className="fv-optins__empty">{'Loading\u2026'}</p>;
  if (error) return <p className="fv-optins__error" role="alert">{error}</p>;
  if (!data) return null;

  return (
    <div>
      <div className="fv-optins__grid">
        <div className="fv-optins__block">
          <h6>Actual minus predicted ({data.scenario || 'run'})</h6>
          <Row label="Speed (average bias)">{signed(data.speedBiasKn, 2, 'kn')}</Row>
          <Row label="Speed (mean absolute error)">{num(data.speedMeanAbsErrorKn, 2, 'kn')}</Row>
          <Row label="RPM">{signed(data.rpmBias, 1)}</Row>
          <Row label="Power">{signed(data.powerBiasKw, 0, 'kW')}</Row>
          <Row label="M/E fuel">{signed(data.fuelBiasMtPerDay, 1, 'MT/day')}{data.fuelBiasPct != null ? ` (${signed(data.fuelBiasPct, 1, '%')})` : ''}</Row>
          <Row label="VLSFO ROB">{signed(data.robVlsfoBiasMt, 1, 'MT')}</Row>
        </div>
      </div>

      {data.points.length > 0 && (
        <table className="fv-optins__table">
          <thead>
            <tr>
              <th>Report (UTC)</th><th>Speed act / plan (kn)</th><th>RPM act / plan</th><th>Power act / plan (kW)</th>
              <th>Fuel act / plan (MT/d)</th><th>VLSFO ROB act / plan (MT)</th>
            </tr>
          </thead>
          <tbody>
            {data.points.map((p) => (
              <tr key={p.timeUtc}>
                <td>{fmtUtc(p.timeUtc)}</td>
                <td>{num(p.actualSpeedKn, 1)} / {num(p.predictedSogKn, 1)}</td>
                <td>{num(p.actualRpm, 0)} / {num(p.predictedRpm, 0)}</td>
                <td>{num(p.actualPowerKw, 0)} / {num(p.predictedPowerKw, 0)}</td>
                <td>{num(p.actualFuelMtPerDay, 1)} / {num(p.predictedFuelMtPerDay, 1)}</td>
                <td>{num(p.actualRobVlsfoMt, 0)} / {num(p.predictedRobVlsfoMt, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.trend.length > 0 && (
        <>
          <h6 className="fv-optins__sub">Observed operating points by month (weather-corrected noon reports)</h6>
          <table className="fv-optins__table">
            <thead>
              <tr><th>Month</th><th>RPM</th><th>Reports</th><th>Calm speed (kn)</th><th>Power (kW)</th><th>M/E fuel (MT/day)</th></tr>
            </thead>
            <tbody>
              {data.trend.map((t) => (
                <tr key={`${t.month}-${t.rpm}`}>
                  <td>{t.month}</td><td>{t.rpm}</td><td>{t.samples}</td>
                  <td>{num(t.medianCalmSpeedKn, 2)}</td><td>{num(t.medianPowerKw, 0)}</td><td>{num(t.medianMainFuelMtPerDay, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {data.notes.map((n, i) => <p key={i} className="fv-optins__note">{n}</p>)}
    </div>
  );
}

/** Toolbar button for the Route Simulator routes bar; opens a pop-up with the analysis of the selected optimized route, re-optimization suggestions, plan-vs-actual performance and calibration. */
export function OptimizationInsightsPanel({ voyageId, route }: { voyageId?: string; route?: OptimizedRoute | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('analysis');
  const [pending, setPending] = useState(0);

  // Dot on the button when re-optimization suggestions are waiting.
  useEffect(() => {
    if (!voyageId) return undefined;
    let cancelled = false;
    optimizationApi.getRecommendations(voyageId, 'Pending')
      .then((rows) => { if (!cancelled) setPending(rows.length); })
      .catch(() => { if (!cancelled) setPending(0); });
    return () => { cancelled = true; };
  }, [voyageId, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!voyageId) return null;

  const tabs: [Tab, string][] = [
    ['analysis', 'Analysis'],
    ['segments', 'Segments'],
    ['suggestions', 'Re-optimization suggestions'],
    ['performance', 'Plan vs actual'],
    ['calibration', 'Calibration'],
  ];

  return (
    <>
      <button
        type="button"
        className="fv-sim2__routes-btn fv-optins__open"
        onClick={() => setOpen(true)}
        title="Optimization details"
        aria-label={pending > 0 ? `Optimization details, ${pending} suggestion${pending === 1 ? '' : 's'} waiting` : 'Optimization details'}
      >
        <i className="fas fa-chart-line" aria-hidden="true" />
        {pending > 0 && <span className="fv-optins__dot" aria-hidden="true" />}
      </button>
      {open && createPortal(
        <div className="fv-optins-modal__overlay" role="presentation" onClick={() => setOpen(false)}>
          <div className="fv-optins-modal" role="dialog" aria-modal="true" aria-label="Optimization details" onClick={(event) => event.stopPropagation()}>
            <div className="fv-optins-modal__head">
              <div>
                <span className="fv-optins-modal__title">Optimization details</span>
                <span className="fv-optins-modal__sub">{route ? route.name : 'No optimized route selected'}</span>
              </div>
              <button type="button" className="fv-optins-modal__close" onClick={() => setOpen(false)} aria-label="Close" title="Close">
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <div className="fv-optins__tabs" role="tablist">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`fv-optins__tab${tab === id ? ' fv-optins__tab--active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="fv-optins-modal__body">
              {tab === 'analysis' && <AnalysisTab route={route} />}
              {tab === 'segments' && <SegmentsTab route={route} />}
              {tab === 'suggestions' && <SuggestionsTab voyageId={voyageId} />}
              {tab === 'performance' && <PerformanceTab voyageId={voyageId} route={route} />}
              {tab === 'calibration' && <CalibrationTab />}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
