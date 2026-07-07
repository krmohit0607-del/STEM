import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useActiveSimRoute } from '../data/routeSimulatorStore';
import {
  DEFAULT_MARKET_FACTORS,
  OPTIMIZATION_SCENARIOS,
  generateOptimizedRoute,
  pathDistanceNm,
  type LatLon,
} from '../data/routeMetrics';
import { addOptimizationResults, requestPanelView } from '../data/optimizationStore';

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

const p2 = (n: number) => String(n).padStart(2, '0');
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function OptimizationRunDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const l = useL();
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

  useEffect(() => {
    if (open) setSavedVersion((v) => v + 1);
  }, [open]);

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

  if (!open) return null;

  const selected = options.find((o) => o.key === routeKey) ?? null;
  const isSpecificEta = scenarioIds.includes('specific-eta');
  const allSelected = scenarioIds.length === OPTIMIZATION_SCENARIOS.length;

  const toggleScenario = (id: string) =>
    setScenarioIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAllScenarios = () =>
    setScenarioIds(allSelected ? [] : OPTIMIZATION_SCENARIOS.map((s) => s.id));

  const run = () => {
    if (!selected || selected.path.length < 2 || scenarioIds.length === 0) return;
    const etdDate = new Date(etd);
    const market = {
      hirePerDay: Number(hire) || 0,
      foCost: Number(fo) || 0,
      goCost: Number(go) || 0,
      euaCost: Number(eua) || 0,
    };
    // Generate one optimized route per selected scenario in a single run.
    const newRoutes = scenarioIds.map((sid, i) =>
      generateOptimizedRoute({
        basePath: selected.path,
        baseName: selected.label,
        scenarioId: sid,
        market,
        etd: etdDate,
        cpSpeedKn: 12,
        cpConsPerDay: 22,
        targetEta: sid === 'specific-eta' ? new Date(targetEta) : null,
        index: runIndex + i,
      }),
    );
    setRunIndex((i) => i + scenarioIds.length);
    addOptimizationResults(newRoutes, {
      baseRouteName: selected.label,
      scenarioId: scenarioIds.join(','),
      market,
      etd: etdDate.toISOString(),
      targetEta: isSpecificEta ? new Date(targetEta).toISOString() : null,
    });
    requestPanelView('simulator');
    onClose();
  };

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
                {allSelected ? t('clear', 'Clear') : t('selectAll', 'Select all')}
              </button>
            </span>
            <div className="fv-opt-pop__scenarios">
              {OPTIMIZATION_SCENARIOS.map((s) => (
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

          <div className="fv-opt-pop__grid">
            <label className="fv-opt-pop__field">
              <span>{t('etd', 'ETD')}</span>
              <input type="datetime-local" value={etd} onChange={(e) => setEtd(e.target.value)} />
            </label>
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
