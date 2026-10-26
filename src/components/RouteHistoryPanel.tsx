import { useEffect, useMemo, useState } from 'react';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { SCENARIO_BY_ID } from '../data/routeMetrics';
import {
  readRouteHistoryForVoyage,
  hydrateRouteHistoryFromBackend,
  activateRouteHistoryEntry,
  createViewSnapshotFromHistoryEntry,
  type RouteHistoryEntry,
} from '../data/routeHistoryStore';
import { useSavedRoutesVersion } from '../data/optimizationStore';
import {
  setHistoryCandidate,
  clearComparisonSelection,
  useComparisonSelection,
  type ComparisonCandidate,
} from '../data/comparisonSelectionStore';

/** Format an ISO date-time as `Oct 20, 2026 07:12Z` (UTC, matches the rest
 *  of the Route Simulator's date formatting). */
function fmtWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }) +
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

/** Human-readable summary of what a history entry was generated with — the
 *  "why does this route exist" line for each row. */
function criteriaSummary(entry: RouteHistoryEntry, t: (key: string, fallback: string) => string): string {
  const parts: string[] = [];
  const scenarioIds = entry.criteria.scenarioId.split(',').filter(Boolean);
  const scenarioLabels = scenarioIds.map((id) => SCENARIO_BY_ID[id]?.label ?? id);
  if (scenarioLabels.length > 0) parts.push(scenarioLabels.join(', '));
  const cs = entry.criteria.customSimulation;
  if (cs) {
    parts.push(`${cs.speedKn.toFixed(1)} kn`);
    if (cs.rpmMin || cs.rpmMax) parts.push(`${t('rpmLabel', 'RPM')} ${cs.rpmMin ?? '—'}\u2013${cs.rpmMax ?? '—'}`);
    if (cs.mcrMin || cs.mcrMax) parts.push(`${t('mcrLabel', 'MCR')} ${cs.mcrMin ?? '—'}\u2013${cs.mcrMax ?? '—'}%`);
  }
  if (entry.criteria.targetEta) parts.push(`${t('targetEta', 'Target ETA')}: ${fmtWhen(entry.criteria.targetEta)}`);
  return parts.join(' · ') || '—';
}

/** Build this entry's shared Comparison-selection candidate shape. */
function toCandidate(entry: RouteHistoryEntry): ComparisonCandidate {
  return {
    key: `hist-${entry.id}`,
    label: entry.name,
    color: '#1f6feb',
    path: entry.path,
    // `?? 0` guards entries recorded before these fields existed.
    distanceNm: entry.summary.distanceNm ?? 0,
    durationH: entry.summary.durationH ?? 0,
    speedKn: entry.summary.speedKn ?? 0,
    ecaDistanceNm: entry.summary.ecaDistanceNm ?? 0,
    ecaDurationH: entry.summary.ecaDurationH ?? 0,
    fuelTons: entry.summary.fuelTons ?? 0,
    ecaFuelTons: entry.summary.ecaFuelTons ?? 0,
    fuelCost: entry.summary.fuelCost ?? 0,
    hireCost: entry.summary.hireCost ?? 0,
    euaCost: entry.summary.euaCost ?? 0,
    totalCost: entry.summary.totalCost ?? 0,
    co2Tons: entry.summary.co2Tons ?? 0,
    etdIso: entry.summary.etdIso,
    etaIso: entry.summary.etaIso,
  };
}

/**
 * "All Routes" — a permanent, append-only history of every candidate route
 * ever produced by an Optimization run for this voyage, with the criteria it
 * was generated under, so a past run's options (and the reasoning behind
 * them) are never lost even once the Route Simulator's own list moves on.
 * Picking one here reactivates it exactly like "Set as active"/"Follow
 * route" elsewhere.
 */
export function RouteHistoryPanel() {
  const l = useL();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };
  const voyage = useSelectedVoyage();
  const savedRoutesVersion = useSavedRoutesVersion();
  const [hydrated, setHydrated] = useState(0);

  // Pull any history recorded from another device/browser once per visit.
  useMemo(() => {
    void hydrateRouteHistoryFromBackend().then((changed) => {
      if (changed) setHydrated((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = useMemo(
    () => readRouteHistoryForVoyage(voyage?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voyage?.id, savedRoutesVersion, hydrated],
  );

  // Deselect any "All Routes" entries picked for a comparison when the
  // voyage changes — a past selection from a different voyage's history
  // shouldn't silently carry over.
  useEffect(() => {
    clearComparisonSelection();
  }, [voyage?.id]);

  const comparisonSelection = useComparisonSelection();
  const selectedHistoryKeys = useMemo(
    () => new Set(comparisonSelection.map((c) => c.key)),
    [comparisonSelection],
  );

  if (entries.length === 0) {
    return (
      <div className="fv-sim2">
        <div className="fv-sim2__empty">
          <i className="fas fa-clock-rotate-left" aria-hidden="true" />
          <p>
            {t(
              'routeHistoryEmpty',
              'Every route generated by an Optimize run for this voyage will be recorded here, so you can come back and reactivate one later.',
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fv-sim2 fv-sim2__history">
      <div className="fv-sim2__table-wrap">
        <table className="fv-sim2__table">
          <thead>
            <tr>
              <th className="fv-sim2__col-check" aria-label={t('compare', 'Compare')} />
              <th className="fv-sim2__col-name">{t('routeName', 'Route')}</th>
              <th>{t('generatedAt', 'Generated')}</th>
              <th>{t('criteria', 'Criteria / constraints')}</th>
              <th>{t('distance', 'Distance')}</th>
              <th>{t('timeToGo', 'Duration')}</th>
              <th>{t('fuelToGo', 'Fuel')}</th>
              <th>{t('totalCostToGo', 'Total cost')}</th>
              <th>{t('etd', 'ETD')}</th>
              <th>{t('eta', 'ETA')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="fv-sim2__col-check">
                  <input
                    type="checkbox"
                    checked={selectedHistoryKeys.has(`hist-${entry.id}`)}
                    onChange={(e) => setHistoryCandidate(toCandidate(entry), e.target.checked)}
                    aria-label={t('addToComparison', 'Add to comparison')}
                    title={t('addToComparison', 'Add to comparison')}
                  />
                </td>
                <td className="fv-sim2__col-name fv-sim2__history-name">
                  <strong>{entry.name}</strong>
                  <small>{t('basedOn', 'Based on')}: {entry.baseRouteName}</small>
                </td>
                <td>{fmtWhen(entry.generatedAt)}</td>
                <td className="fv-sim2__history-criteria">{criteriaSummary(entry, t)}</td>
                <td>{Math.round(entry.summary.distanceNm).toLocaleString()} {t('nmUnit', 'NM')}</td>
                <td>{fmtDuration(entry.summary.durationH)}</td>
                <td>{Math.round(entry.summary.fuelTons).toLocaleString()} MT</td>
                <td>US${Math.round(entry.summary.totalCost).toLocaleString()}</td>
                <td>{fmtWhen(entry.summary.etdIso)}</td>
                <td>{fmtWhen(entry.summary.etaIso)}</td>
                <td className="fv-sim2__history-actions">
                  <button
                    type="button"
                    className="fv-sim2__history-view"
                    onClick={() => {
                      const id = createViewSnapshotFromHistoryEntry(entry);
                      window.open(`/route-view/${id}`, '_blank', 'noopener');
                    }}
                    title={t('viewRouteWithWeather', 'View this route with the weather at the time it was run')}
                  >
                    <i className="fas fa-eye" aria-hidden="true" /> {t('view', 'View')}
                  </button>
                  <button
                    type="button"
                    className="fv-sim2__history-activate"
                    onClick={() => activateRouteHistoryEntry(entry, voyage?.id)}
                    title={t('activateRoute', 'Activate this route')}
                  >
                    <i className="fas fa-circle-check" aria-hidden="true" /> {t('activate', 'Activate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
