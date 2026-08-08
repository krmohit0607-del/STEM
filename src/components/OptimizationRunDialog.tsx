import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useActiveSimRoute } from '../data/routeSimulatorStore';
import {
  computeRouteMetrics,
  DEFAULT_MARKET_FACTORS,
  OPTIMIZATION_SCENARIOS,
  generateOptimizedRoute,
  haversineNM,
  pathDistanceNm,
  type LatLon,
} from '../data/routeMetrics';
import { addOptimizationResults, requestPanelView } from '../data/optimizationStore';
import { loadLimitsFor } from '../data/limitsConstraints';
import { useVesselPosition } from '../data/vesselPosition';
import { useRouteReportMarkers } from '../data/routeReportMarkers';

/**
 * Optimization run dialog — pick a route (from the routes available in the
 * Route Simulator / the route currently being edited), choose an optimization
 * scenario, review/edit the market factors (hire, fuel, EUA), amend the ETD
 * (and a target ETA for the Specific-ETA scenario), then run. Results are
 * published to the Optimization drawer tab.
 *
 * Opened from the route editor's "Optimize" button.
 */

interface SavedWaypoint {
  lat: string;
  lon: string;
}
interface SavedRoute {
  id: string;
  name: string;
  waypoints: SavedWaypoint[];
}

function dmToDec(raw: string): number {
  if (!raw) return NaN;
  const hemiMatch = raw.match(/[NSEW]/i);
  const hemi = hemiMatch ? hemiMatch[0].toUpperCase() : '';
  const nums = raw.match(/[\d.]+/g)?.map(Number) ?? [];
  if (nums.length === 0) return NaN;
  const dec = (nums[0] ?? 0) + (nums[1] ?? 0) / 60 + (nums[2] ?? 0) / 3600;
  return hemi === 'S' || hemi === 'W' ? -dec : dec;
}

function readSavedRoutes(): SavedRoute[] {
  try {
    const raw = window.localStorage.getItem('fv.savedRoutes');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SavedRoute[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

interface RouteOption {
  key: string;
  label: string;
  path: LatLon[];
}

const CUSTOM_SIMULATION_ID = 'custom-simulation';
const CUSTOM_SIMULATION_COLOR = '#f97316';

const p2 = (n: number) => String(n).padStart(2, '0');
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function formatPos([lat, lon]: LatLon): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function OptimizationRunDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const l = useL();
  const voyage = useSelectedVoyage();
  const vesselPos = useVesselPosition();
  const reportMarkers = useRouteReportMarkers();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const activeRoute = useActiveSimRoute();
  const [routeKey, setRouteKey] = useState('');
  const [scenarioIds, setScenarioIds] = useState<string[]>([OPTIMIZATION_SCENARIOS[5].id]);
  const [hire, setHire] = useState(String(DEFAULT_MARKET_FACTORS.hirePerDay));
  const [fo, setFo] = useState(String(DEFAULT_MARKET_FACTORS.foCost));
  const [go, setGo] = useState(String(DEFAULT_MARKET_FACTORS.goCost));
  const [eua, setEua] = useState(String(DEFAULT_MARKET_FACTORS.euaCost));
  const [etd, setEtd] = useState(() => toLocalInput(new Date()));
  const [targetEta, setTargetEta] = useState(() =>
    toLocalInput(new Date(Date.now() + 7 * 86400_000)),
  );
  const [savedVersion, setSavedVersion] = useState(0);
  const [runIndex, setRunIndex] = useState(0);

  const [customSpeed, setCustomSpeed] = useState('12');
  const [customConsumption, setCustomConsumption] = useState('22');
  const [customRta, setCustomRta] = useState('');
  const [customRpmMin, setCustomRpmMin] = useState('');
  const [customRpmMax, setCustomRpmMax] = useState('');
  const [customMcrMin, setCustomMcrMin] = useState('');
  const [customMcrMax, setCustomMcrMax] = useState('');
  const [customDraft, setCustomDraft] = useState('');
  const [customDisplacement, setCustomDisplacement] = useState('');
  const [customGm, setCustomGm] = useState('');
  const [customEcaPct, setCustomEcaPct] = useState('8');

  useEffect(() => {
    if (open) setSavedVersion((v) => v + 1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const limits = loadLimitsFor(voyage?.id);
    setCustomSpeed(limits.constraints.speedMax || limits.constraints.speedMin || '12');
    setCustomConsumption(limits.constraints.consumption || limits.speedCons.maxFoPerDay || '22');
    setCustomRta(limits.constraints.rta || '');
    setCustomRpmMin(limits.constraints.rpmMin || '');
    setCustomRpmMax(limits.constraints.rpmMax || '');
    setCustomMcrMin(limits.constraints.mcrMin || '');
    setCustomMcrMax(limits.constraints.mcrMax || '');
    setCustomDraft(limits.weatherLimits.draft || '');
    setCustomDisplacement(limits.weatherLimits.displacement || '');
    setCustomGm(limits.weatherLimits.gm || '');
  }, [open, voyage?.id]);

  const options = useMemo<RouteOption[]>(() => {
    const list: RouteOption[] = [];
    if (activeRoute && activeRoute.path.length >= 2) {
      list.push({
        key: 'active',
        label: `${activeRoute.label} (${t('active', 'active')})`,
        path: activeRoute.path,
      });
    }
    for (const r of readSavedRoutes()) {
      const path = r.waypoints
        .map((wp) => [dmToDec(wp.lat), dmToDec(wp.lon)] as LatLon)
        .filter(([lat, lon]) => !Number.isNaN(lat) && !Number.isNaN(lon));
      if (path.length >= 2) list.push({ key: `saved-${r.id}`, label: r.name, path });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute, savedVersion]);

  useEffect(() => {
    if (open && !options.some((o) => o.key === routeKey)) {
      setRouteKey(options[0]?.key ?? '');
    }
  }, [open, options, routeKey]);

  const selected = options.find((o) => o.key === routeKey) ?? null;
  const isSpecificEta = scenarioIds.includes('specific-eta');
  const hasCustomSimulation = scenarioIds.includes(CUSTOM_SIMULATION_ID);
  const allSelected = scenarioIds.length === OPTIMIZATION_SCENARIOS.length;

  function latestReportAnchor(): { pos: LatLon; sourceLabel: string; dateTimeIso?: string } | null {
    const nonInterpolated = reportMarkers.filter((m) => !m.isInterpolated);
    if (nonInterpolated.length === 0) return null;
    let best = nonInterpolated[nonInterpolated.length - 1];
    let bestTs = Number.NEGATIVE_INFINITY;
    for (const marker of nonInterpolated) {
      const ts = marker.dateTimeIso ? Date.parse(marker.dateTimeIso) : Number.NaN;
      if (Number.isFinite(ts) && ts >= bestTs) {
        bestTs = ts;
        best = marker;
      }
    }
    return {
      pos: [best.pos[0], best.pos[1]],
      sourceLabel: best.dateTimeText ? `Last report (${best.dateTimeText})` : 'Last report position',
      dateTimeIso: best.dateTimeIso,
    };
  }

  function resolveAnchor(): {
    pos: LatLon;
    source: 'report' | 'ais';
    sourceLabel: string;
    dateTimeIso?: string;
  } | null {
    const report = latestReportAnchor();
    if (report) return { ...report, source: 'report' };
    if (vesselPos) {
      return {
        pos: [vesselPos.lat, vesselPos.lon],
        source: 'ais',
        sourceLabel: vesselPos.label || 'Last AIS position',
      };
    }
    return null;
  }

  function nearestPathVertexIndex(path: LatLon[], pos: LatLon): number {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < path.length; i += 1) {
      const d = haversineNM(path[i][0], path[i][1], pos[0], pos[1]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  const startAnchor = useMemo(() => {
    if (!selected || selected.path.length < 2) {
      return {
        source: 'none' as const,
        sourceLabel: 'From departure',
        startVertexIndex: 0,
        startDateTimeIso: undefined as string | undefined,
        anchorPos: null as LatLon | null,
      };
    }
    const anchor = resolveAnchor();
    if (!anchor) {
      return {
        source: 'none' as const,
        sourceLabel: 'From departure',
        startVertexIndex: 0,
        startDateTimeIso: undefined as string | undefined,
        anchorPos: null as LatLon | null,
      };
    }
    const idx = nearestPathVertexIndex(selected.path, anchor.pos);
    const startVertexIndex = Math.min(Math.max(0, idx), selected.path.length - 2);
    return {
      source: anchor.source,
      sourceLabel: anchor.sourceLabel,
      startVertexIndex,
      startDateTimeIso: anchor.dateTimeIso,
      anchorPos: anchor.pos,
    };
  }, [selected, reportMarkers, vesselPos]);

  const lastPositionDateTimeText = useMemo(() => {
    if (startAnchor.source === 'none') return '';
    if (!startAnchor.startDateTimeIso) {
      return startAnchor.source === 'report' ? 'Last report time unavailable' : 'Last AIS time unavailable';
    }
    const d = new Date(startAnchor.startDateTimeIso);
    if (Number.isNaN(d.getTime())) {
      return startAnchor.source === 'report' ? 'Last report time unavailable' : 'Last AIS time unavailable';
    }
    return d.toLocaleString();
  }, [startAnchor]);

  const lastPositionCoordText = useMemo(() => {
    if (!startAnchor.anchorPos) return '';
    return formatPos(startAnchor.anchorPos);
  }, [startAnchor]);

  const toggleScenario = (id: string) =>
    setScenarioIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAllScenarios = () =>
    setScenarioIds(
      allSelected ? [] : [...OPTIMIZATION_SCENARIOS.map((s) => s.id), CUSTOM_SIMULATION_ID],
    );

  const scenarioOptions = useMemo(
    () => [
      ...OPTIMIZATION_SCENARIOS,
      {
        id: CUSTOM_SIMULATION_ID,
        label: 'Custom Simulation',
        icon: 'fa-sliders',
        description: 'Use custom speed, consumption, RTA, RPM, MCR and hydrostatic criteria.',
      },
    ],
    [],
  );

  const allSelectedNow = scenarioIds.length === scenarioOptions.length;

  const run = () => {
    if (!selected || selected.path.length < 2 || scenarioIds.length === 0) return;
    const etdDate = startAnchor.startDateTimeIso ? new Date(startAnchor.startDateTimeIso) : new Date(etd);
    const market = {
      hirePerDay: Number(hire) || 0,
      foCost: Number(fo) || 0,
      goCost: Number(go) || 0,
      euaCost: Number(eua) || 0,
    };

    const customSpeedN = Number(customSpeed) > 0 ? Number(customSpeed) : 12;
    const customConsN = Number(customConsumption) > 0 ? Number(customConsumption) : 22;
    const customRpmMinN = Number(customRpmMin);
    const customRpmMaxN = Number(customRpmMax);
    const customMcrMinN = Number(customMcrMin);
    const customMcrMaxN = Number(customMcrMax);
    const customDraftN = Number(customDraft);
    const customDisplacementN = Number(customDisplacement);
    const customGmN = Number(customGm);
    const customEcaFraction = Math.max(0, Math.min(1, (Number(customEcaPct) || 8) / 100));

    const startIndex = startAnchor.startVertexIndex;
    const fixedPrefix = selected.path.slice(0, startIndex + 1);
    const remainingPath = selected.path.slice(startIndex);
    if (remainingPath.length < 2) return;

    const buildForScenario = (sid: string, idx: number) => {
      const isCustom = sid === CUSTOM_SIMULATION_ID;

      let customSpeedAdjusted = customSpeedN;
      if (Number.isFinite(customMcrMinN) && Number.isFinite(customMcrMaxN) && customMcrMaxN > 0) {
        const mcrMid = (customMcrMinN + customMcrMaxN) / 2;
        customSpeedAdjusted *= Math.max(0.7, Math.min(1.15, mcrMid / 85));
      }
      if (Number.isFinite(customRpmMinN) && Number.isFinite(customRpmMaxN) && customRpmMaxN > customRpmMinN) {
        const rpmSpan = customRpmMaxN - customRpmMinN;
        customSpeedAdjusted *= Math.max(0.82, Math.min(1.05, rpmSpan / 35));
      }
      if (Number.isFinite(customDraftN) && customDraftN > 0) {
        customSpeedAdjusted *= Math.max(0.8, 1 - customDraftN / 120);
      }
      if (Number.isFinite(customDisplacementN) && customDisplacementN > 0) {
        customSpeedAdjusted *= Math.max(0.82, 1 - customDisplacementN / 800000);
      }
      if (Number.isFinite(customGmN) && customGmN > 0 && customGmN < 0.8) {
        customSpeedAdjusted *= 0.92;
      }
      customSpeedAdjusted = Math.max(6, Math.min(24, customSpeedAdjusted));

      const baseScenarioId = isCustom
        ? (customRta ? 'specific-eta' : 'balanced')
        : sid;

      const generated = generateOptimizedRoute({
        basePath: remainingPath,
        baseName: selected.label,
        scenarioId: baseScenarioId,
        market,
        etd: etdDate,
        cpSpeedKn: isCustom ? customSpeedAdjusted : 12,
        cpConsPerDay: isCustom ? customConsN : 22,
        targetEta:
          isCustom && customRta
            ? new Date(customRta)
            : sid === 'specific-eta'
              ? new Date(targetEta)
              : null,
        index: runIndex + idx,
      });

      const mergedPath =
        fixedPrefix.length > 1 ? [...fixedPrefix, ...generated.path.slice(1)] : generated.path;

      const derivedConsPerDay =
        generated.metrics.durationH > 0
          ? generated.metrics.fuelTons / Math.max(1e-6, generated.metrics.durationH / 24)
          : isCustom
            ? customConsN
            : 22;

      const mergedMetrics = computeRouteMetrics({
        path: mergedPath,
        speedKn: generated.metrics.speedKn,
        etd: etdDate,
        market,
        consPerDay: derivedConsPerDay,
        ecaFraction: isCustom ? customEcaFraction : undefined,
      });

      return {
        ...generated,
        scenarioId: sid,
        name: isCustom ? 'Custom Simulation' : generated.name,
        color: isCustom ? CUSTOM_SIMULATION_COLOR : generated.color,
        path: mergedPath,
        metrics: mergedMetrics,
      };
    };

    // Generate one optimized route per selected scenario in a single run.
    const newRoutes = scenarioIds.map((sid, i) => buildForScenario(sid, i));
    setRunIndex((i) => i + scenarioIds.length);
    addOptimizationResults(newRoutes, {
      baseRouteName: selected.label,
      scenarioId: scenarioIds.join(','),
      market,
      etd: etdDate.toISOString(),
      targetEta: isSpecificEta ? new Date(targetEta).toISOString() : null,
      customSimulation: hasCustomSimulation
        ? {
            speedKn: customSpeedN,
            consumptionPerDay: customConsN,
            rta: customRta || null,
            rpmMin: customRpmMin,
            rpmMax: customRpmMax,
            mcrMin: customMcrMin,
            mcrMax: customMcrMax,
            draft: customDraft,
            displacement: customDisplacement,
            gm: customGm,
            ecaFractionPct: customEcaFraction * 100,
          }
        : null,
      startAnchor: startAnchor.source !== 'none'
        ? {
            source: startAnchor.source,
            startVertexIndex: startAnchor.startVertexIndex,
          }
        : null,
    });
    requestPanelView('simulator');
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="fv-opt-pop__overlay" role="presentation" onClick={onClose}>
      <div
        className="fv-opt-pop"
        role="dialog"
        aria-modal="true"
        aria-label={t('runOptimization', 'Run optimization')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fv-opt-pop__head">
          <h3>
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />{' '}
            {t('runOptimization', 'Run Optimization')}
          </h3>
          <button
            type="button"
            className="fv-opt-pop__close"
            onClick={onClose}
            aria-label={t('close', 'Close')}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="fv-opt-pop__body">
          <label className="fv-opt-pop__field">
            <span>{t('selectRoute', 'Route (from Route Simulator)')}</span>
            {options.length === 0 ? (
              <p className="fv-opt-pop__note">
                {t('noRoutesAvailable', 'No routes available. Draw or save a route first.')}
              </p>
            ) : (
              <select value={routeKey} onChange={(e) => setRouteKey(e.target.value)}>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label} · {Math.round(pathDistanceNm(o.path)).toLocaleString()} NM
                  </option>
                ))}
              </select>
            )}
          </label>

          <div className="fv-opt-pop__field">
            <span>
              {t('scenarios', 'Optimization scenarios')}
              <button type="button" className="fv-opt-pop__linkbtn" onClick={toggleAllScenarios}>
                {allSelectedNow ? t('clear', 'Clear') : t('selectAll', 'Select all')}
              </button>
            </span>
            <div className="fv-opt-pop__scenarios">
              {scenarioOptions.map((s) => (
                <label key={s.id} className="fv-opt-pop__scenario">
                  <input
                    type="checkbox"
                    checked={scenarioIds.includes(s.id)}
                    onChange={() => toggleScenario(s.id)}
                  />
                  <span className="fv-opt-pop__scenario-text">
                    <span className="fv-opt-pop__scenario-label">
                      <i className={`fas ${s.icon}`} aria-hidden="true" /> {s.label}
                    </span>
                    <small className="fv-opt-pop__desc">{s.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {hasCustomSimulation && (
            <div className="fv-opt-pop__factors">
              <span className="fv-opt-pop__factors-title">Custom Simulation Criteria</span>
              <div className="fv-opt-pop__grid">
                <label className="fv-opt-pop__field">
                  <span>Speed (kt)</span>
                  <input type="number" value={customSpeed} onChange={(e) => setCustomSpeed(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field">
                  <span>Consumption (mt/day)</span>
                  <input
                    type="number"
                    value={customConsumption}
                    onChange={(e) => setCustomConsumption(e.target.value)}
                  />
                </label>
                <label className="fv-opt-pop__field">
                  <span>RTA</span>
                  <input
                    type="datetime-local"
                    value={customRta}
                    onChange={(e) => setCustomRta(e.target.value)}
                  />
                </label>
                <label className="fv-opt-pop__field">
                  <span>ECA share (%)</span>
                  <input type="number" value={customEcaPct} onChange={(e) => setCustomEcaPct(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field">
                  <span>RPM Min</span>
                  <input type="number" value={customRpmMin} onChange={(e) => setCustomRpmMin(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field">
                  <span>RPM Max</span>
                  <input type="number" value={customRpmMax} onChange={(e) => setCustomRpmMax(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field">
                  <span>MCR Min (%)</span>
                  <input type="number" value={customMcrMin} onChange={(e) => setCustomMcrMin(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field">
                  <span>MCR Max (%)</span>
                  <input type="number" value={customMcrMax} onChange={(e) => setCustomMcrMax(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field">
                  <span>Draft (m)</span>
                  <input type="number" value={customDraft} onChange={(e) => setCustomDraft(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field">
                  <span>Displacement (mt)</span>
                  <input
                    type="number"
                    value={customDisplacement}
                    onChange={(e) => setCustomDisplacement(e.target.value)}
                  />
                </label>
                <label className="fv-opt-pop__field">
                  <span>GM (m)</span>
                  <input type="number" value={customGm} onChange={(e) => setCustomGm(e.target.value)} />
                </label>
              </div>
            </div>
          )}

          <div className="fv-opt-pop__grid">
            {startAnchor.source === 'none' ? (
              <label className="fv-opt-pop__field">
                <span>{t('etd', 'ETD')}</span>
                <input type="datetime-local" value={etd} onChange={(e) => setEtd(e.target.value)} />
              </label>
            ) : (
              <label className="fv-opt-pop__field">
                <span>Last position date/time</span>
                <textarea
                  value={`Date/Time: ${lastPositionDateTimeText}\nPosition: ${lastPositionCoordText}`}
                  rows={2}
                  readOnly
                  style={{ resize: 'none' }}
                />
              </label>
            )}
            {isSpecificEta && (
              <label className="fv-opt-pop__field">
                <span>{t('targetEta', 'Target ETA')}</span>
                <input
                  type="datetime-local"
                  value={targetEta}
                  onChange={(e) => setTargetEta(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="fv-opt-pop__factors">
            <span className="fv-opt-pop__factors-title">{t('marketFactors', 'Market factors')}</span>
            <div className="fv-opt-pop__grid">
              <label className="fv-opt-pop__field">
                <span>{t('hireRate', 'Hire rate (USD/day)')}</span>
                <input type="number" value={hire} onChange={(e) => setHire(e.target.value)} />
              </label>
              <label className="fv-opt-pop__field">
                <span>{t('foCost', 'VLSFO (USD/ton)')}</span>
                <input type="number" value={fo} onChange={(e) => setFo(e.target.value)} />
              </label>
              <label className="fv-opt-pop__field">
                <span>{t('goCost', 'LSMGO (USD/ton)')}</span>
                <input type="number" value={go} onChange={(e) => setGo(e.target.value)} />
              </label>
              <label className="fv-opt-pop__field">
                <span>{t('euaCost', 'EUA (USD/ton)')}</span>
                <input type="number" value={eua} onChange={(e) => setEua(e.target.value)} />
              </label>
            </div>
          </div>
        </div>

        <footer className="fv-opt-pop__foot">
          <button type="button" className="fv-opt-pop__btn" onClick={onClose}>
            {t('cancel', 'Cancel')}
          </button>
          <button
            type="button"
            className="fv-opt-pop__btn fv-opt-pop__btn--primary"
            onClick={run}
            disabled={!selected || scenarioIds.length === 0}
          >
            <i className="fas fa-play" aria-hidden="true" />{' '}
            {scenarioIds.length > 1
              ? `${t('run', 'Run optimization')} (${scenarioIds.length})`
              : t('run', 'Run optimization')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
