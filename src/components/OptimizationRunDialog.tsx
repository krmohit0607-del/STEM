import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { useActiveSimRoute } from '../data/routeSimulatorStore';
import {
  computeRouteMetrics,
  DEFAULT_MARKET_FACTORS,
  OPTIMIZATION_SCENARIOS,
  SCENARIO_BY_ID,
  scenarioColor,
  generateOptimizedRoute,
  haversineNM,
  pathDistanceNm,
  type LatLon,
  type OptimizedRoute,
} from '../data/routeMetrics';
import { optimizationApi, type OptimizationRestrictedAreaDto } from '../api/optimizationApi';
import { addOptimizationResults, requestPanelView } from '../data/optimizationStore';
import { readSavedRoutesForVoyage } from '../data/savedRoutesStore';
import { appendRouteHistory, type RouteHistoryCriteria } from '../data/routeHistoryStore';
import { buildFrozenWeatherSnapshot, buildFrozenWeatherGrids } from '../data/routeWeatherSnapshot';
import { saveHistoryWeatherGrids } from '../data/routeSnapshotsStore';
import { loadLimitsFor } from '../data/limitsConstraints';
import { getEffectiveAreaConstraints, type AreaConstraint } from '../data/areaConstraints';
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
  rpmMin?: number;
  rpmMax?: number;
  mcrMin?: number;
  mcrMax?: number;
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

function readSavedRoutes(voyageId: string | undefined): SavedRoute[] {
  return readSavedRoutesForVoyage(voyageId) as SavedRoute[];
}

/** A waypoint-level RPM/MCR override, resolved to a decimal position. */
interface WaypointOverride {
  pos: LatLon;
  rpmMin?: number;
  rpmMax?: number;
  mcrMin?: number;
  mcrMax?: number;
}

interface RouteOption {
  key: string;
  label: string;
  path: LatLon[];
  /** Per-waypoint Min/Max RPM/MCR entered in the Waypoint details panel. */
  waypointOverrides?: WaypointOverride[];
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

/** Parse a date-ish input, returning `null` instead of an Invalid Date when
 *  the value is empty/malformed (e.g. a cleared datetime-local field) — an
 *  Invalid Date here would otherwise poison downstream route-metric math and
 *  crash when later formatted. */
function safeDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Closest distance (NM) from `pos` to any vertex of `path`. */
function nearestDistanceNm(path: LatLon[], pos: LatLon): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of path) {
    const d = haversineNM(p[0], p[1], pos[0], pos[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Zone types the optimization engine understands (mirrors `RestrictedAreaDto.ZoneType` on the backend). */
const OPTIMIZATION_ZONE_TYPES = new Set(['no-go-zone', 'speed-control-zone', 'limited-passage-zone', 'eca-zone']);

/** Degrees-per-NM at the equator, used only for a coarse corridor bounding-box filter (not for distance accuracy). */
const DEG_PER_NM = 1 / 60;

/**
 * Admin + voyage area constraints that actually overlap the route's corridor
 * (bounding box padded by `padNm`), converted into the shape the backend
 * optimization engine expects. Filtering to the corridor keeps the request
 * small — the full admin dataset covers every zone worldwide.
 */
function gatherRestrictedAreasForCorridor(
  path: LatLon[],
  voyageId: string | undefined,
  padNm: number,
): OptimizationRestrictedAreaDto[] {
  if (path.length === 0) return [];
  const pad = padNm * DEG_PER_NM;
  const minLat = Math.min(...path.map((p) => p[0])) - pad;
  const maxLat = Math.max(...path.map((p) => p[0])) + pad;
  const minLng = Math.min(...path.map((p) => p[1])) - pad;
  const maxLng = Math.max(...path.map((p) => p[1])) + pad;

  const ringOverlapsBbox = (ring: [number, number][]): boolean => {
    for (const [lat, lng] of ring) {
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) return true;
    }
    return false;
  };

  const metersPerSecToKnots = (v: string): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n * 1.943844 : undefined;
  };

  return getEffectiveAreaConstraints(voyageId)
    .filter((c: AreaConstraint) => OPTIMIZATION_ZONE_TYPES.has(c.zoneType))
    .filter((c) => c.rings.some(ringOverlapsBbox))
    .map((c) => ({
      id: c.id,
      zoneType: c.zoneType,
      rings: c.rings,
      rpmMin: c.rpmMin ? Number(c.rpmMin) : undefined,
      rpmMax: c.rpmMax ? Number(c.rpmMax) : undefined,
      speedMaxKn: metersPerSecToKnots(c.speedMax),
    }));
}

/** A waypoint override is "on" a leg if within this distance of one of its vertices. */
const WAYPOINT_OVERRIDE_MATCH_NM = 15;

/** Scale `baseSpeed` by a waypoint's Min/Max RPM/MCR, the same way the
 *  Custom Simulation scenario scales its speed from the global Limits &
 *  Constraints values — so a waypoint override behaves identically, just
 *  sourced from the Waypoint details panel instead. */
function speedFromRpmMcr(
  baseSpeed: number,
  rpmMin?: number,
  rpmMax?: number,
  mcrMin?: number,
  mcrMax?: number,
): number {
  let speed = baseSpeed;
  if (mcrMin != null && mcrMax != null && mcrMax > 0) {
    const mcrMid = (mcrMin + mcrMax) / 2;
    speed *= Math.max(0.7, Math.min(1.15, mcrMid / 85));
  }
  if (rpmMin != null && rpmMax != null && rpmMax > rpmMin) {
    const rpmSpan = rpmMax - rpmMin;
    speed *= Math.max(0.82, Math.min(1.05, rpmSpan / 35));
  }
  return Math.max(6, Math.min(24, speed));
}

export function OptimizationRunDialog({
  open,
  onClose,
  initialRouteKey,
}: {
  open: boolean;
  onClose: () => void;
  /** Force the route selector to this key (e.g. `'active'`) every time the
   *  dialog opens — used by the "Re-optimize Active Route" action so it
   *  always targets the active route regardless of whatever was last picked
   *  in a previous session of this dialog. */
  initialRouteKey?: string;
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
  /** Which last-known position to resume the optimization from — the
   *  Master's validated Tracksheet report, or the last received AIS
   *  position — picked explicitly so the user can see and choose between
   *  the two instead of one being silently preferred. */
  const [anchorChoice, setAnchorChoice] = useState<'report' | 'ais'>('report');

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

  // Default to the Tracksheet report when available (falling back to the
  // last AIS position), each time the dialog is (re)opened — the user can
  // still switch explicitly via the radio options below.
  useEffect(() => {
    if (!open) return;
    const report = latestReportAnchor();
    setAnchorChoice(report ? 'report' : vesselPos ? 'ais' : 'report');
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        waypointOverrides: activeRoute.waypointOverrides,
      });
    }
    for (const r of readSavedRoutes(voyage?.id)) {
      const path = r.waypoints
        .map((wp) => [dmToDec(wp.lat), dmToDec(wp.lon)] as LatLon)
        .filter(([lat, lon]) => !Number.isNaN(lat) && !Number.isNaN(lon));
      if (path.length < 2) continue;
      const waypointOverrides = r.waypoints
        .filter(
          (wp) => wp.rpmMin != null || wp.rpmMax != null || wp.mcrMin != null || wp.mcrMax != null,
        )
        .map((wp) => ({
          pos: [dmToDec(wp.lat), dmToDec(wp.lon)] as LatLon,
          rpmMin: wp.rpmMin,
          rpmMax: wp.rpmMax,
          mcrMin: wp.mcrMin,
          mcrMax: wp.mcrMax,
        }))
        .filter((o) => !Number.isNaN(o.pos[0]) && !Number.isNaN(o.pos[1]));
      list.push({
        key: `saved-${r.id}`,
        label: r.name,
        path,
        waypointOverrides: waypointOverrides.length > 0 ? waypointOverrides : undefined,
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute, savedVersion, voyage?.id]);

  useEffect(() => {
    if (open && !options.some((o) => o.key === routeKey)) {
      setRouteKey(options[0]?.key ?? '');
    }
  }, [open, options, routeKey]);

  // "Re-optimize Active Route" opens the dialog wanting the active route
  // specifically, regardless of whatever route was last selected in a prior
  // session of this same dialog.
  useEffect(() => {
    if (open && initialRouteKey && options.some((o) => o.key === initialRouteKey)) {
      setRouteKey(initialRouteKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRouteKey]);

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

  function aisAnchor(): { pos: LatLon; sourceLabel: string; dateTimeIso?: string } | null {
    if (!vesselPos) return null;
    return {
      pos: [vesselPos.lat, vesselPos.lon],
      sourceLabel: vesselPos.label || 'Last AIS position',
      dateTimeIso: vesselPos.dateTimeIso,
    };
  }

  function resolveAnchor(): {
    pos: LatLon;
    source: 'report' | 'ais';
    sourceLabel: string;
    dateTimeIso?: string;
  } | null {
    const report = latestReportAnchor();
    const ais = aisAnchor();
    const preferred = anchorChoice === 'ais' ? ais : report;
    const fallback = anchorChoice === 'ais' ? report : ais;
    const chosen = preferred ?? fallback;
    if (!chosen) return null;
    const source: 'report' | 'ais' = chosen === report ? 'report' : 'ais';
    return { ...chosen, source };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, reportMarkers, vesselPos, anchorChoice]);

  /** Both candidate anchors (independent of which one is currently chosen),
   *  so the UI can show both side by side with their own date/time + position. */
  const reportAnchorInfo = useMemo(() => latestReportAnchor(), [reportMarkers]);
  const aisAnchorInfo = useMemo(() => aisAnchor(), [vesselPos]);

  const fmtAnchorLine = (anchor: { pos: LatLon; dateTimeIso?: string } | null, unavailableLabel: string) => {
    if (!anchor) return unavailableLabel;
    const when = anchor.dateTimeIso && !Number.isNaN(new Date(anchor.dateTimeIso).getTime())
      ? new Date(anchor.dateTimeIso).toLocaleString()
      : 'Time unavailable';
    return `${when} · ${formatPos(anchor.pos)}`;
  };

  /**
   * Waypoint-level RPM/MCR overrides that fall within the portion of the
   * route being re-optimized (from the resume position onward). When
   * present, these drive every scenario's speed for this run instead of the
   * Limits & Constraints settings — the whole point of setting them.
   */
  const waypointOverrideMatch = useMemo(() => {
    if (!selected || selected.path.length < 2 || !selected.waypointOverrides?.length) return null;
    const remaining = selected.path.slice(startAnchor.startVertexIndex);
    if (remaining.length < 2) return null;
    const matched = selected.waypointOverrides.filter(
      (o) => nearestDistanceNm(remaining, o.pos) <= WAYPOINT_OVERRIDE_MATCH_NM,
    );
    if (matched.length === 0) return null;
    const baseSpeed = Number(customSpeed) > 0 ? Number(customSpeed) : 12;
    const speedKn =
      matched.reduce(
        (sum, o) => sum + speedFromRpmMcr(baseSpeed, o.rpmMin, o.rpmMax, o.mcrMin, o.mcrMax),
        0,
      ) / matched.length;
    return { count: matched.length, speedKn };
  }, [selected, startAnchor.startVertexIndex, customSpeed]);

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

  const run = async () => {
    if (!selected || selected.path.length < 2 || scenarioIds.length === 0) return;
    const parsedEtd = startAnchor.startDateTimeIso ? new Date(startAnchor.startDateTimeIso) : new Date(etd);
    // Guard against a cleared/invalid ETD input — never let an Invalid Date
    // reach `.toISOString()` further down.
    const etdDate = Number.isNaN(parsedEtd.getTime()) ? new Date() : parsedEtd;
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

    // Real scenarios (everything but Custom Simulation) run through the
    // native backend engine (weather/zone-aware Dijkstra-over-DAG — see
    // `RouteOptimizationEngine` on the backend) in a single call; Custom
    // Simulation keeps the client-side synthetic generator below since its
    // RPM/MCR/draft/GM sliders aren't modelled server-side yet. If the API
    // call fails (e.g. vessel not found) every scenario silently falls back
    // to the synthetic generator so the dialog stays usable.
    const realScenarioIds = scenarioIds.filter((sid) => sid !== CUSTOM_SIMULATION_ID);
    const backendResults: Record<string, OptimizedRoute> = {};
    if (realScenarioIds.length > 0 && voyage?.imo) {
      try {
        const targetEtaForApi = isSpecificEta ? safeDate(targetEta) : null;
        const maxDeviationNm = 60;
        const restrictedAreas = gatherRestrictedAreasForCorridor(remainingPath, voyage.id, maxDeviationNm);
        const apiResult = await optimizationApi.run({
          voyageId: voyage.id,
          vesselImo: voyage.imo,
          scenarios: realScenarioIds,
          etdUtc: etdDate.toISOString(),
          originLat: remainingPath[0][0],
          originLng: remainingPath[0][1],
          destLat: remainingPath[remainingPath.length - 1][0],
          destLng: remainingPath[remainingPath.length - 1][1],
          loadCondition: 'Laden',
          hireRatePerDayUsd: market.hirePerDay,
          foPriceUsdPerMt: market.foCost,
          goPriceUsdPerMt: market.goCost,
          euaPriceUsdPerTonneCo2: market.euaCost,
          targetEtaUtc: targetEtaForApi ? targetEtaForApi.toISOString() : null,
          maxDeviationNm,
          restrictedAreas,
        });
        for (const s of apiResult.scenarios) {
          if (!s.isFeasible || s.waypoints.length < 2) continue;
          backendResults[s.scenario] = {
            id: `opt-${s.scenario}-${apiResult.optimizationRunId}`,
            scenarioId: s.scenario,
            name: SCENARIO_BY_ID[s.scenario]?.label ?? s.scenario,
            color: scenarioColor(s.scenario),
            path: s.waypoints.map((w): LatLon => [w.lat, w.lng]),
            metrics: {
              distanceNm: s.distanceNm,
              ecaDistanceNm: s.ecaDistanceNm,
              speedKn: s.averageSpeedKn,
              durationH: s.timeToGoHours,
              ecaDurationH: s.ecaTimeToGoHours,
              fuelTons: s.meFuelRequiredToGoMt,
              ecaFuelTons: s.ecaFuelRequiredToGoMt,
              fuelCost: s.fuelCostToGoUsd,
              hireCost: s.timeCostToGoUsd,
              co2Tons: s.meCo2EmissionsToGoMt,
              euaAllowanceTons: s.meCo2EmissionsToGoMt,
              euaCost: s.emissionsCostToGoUsd,
              totalCost: s.totalCostToGoUsd,
              etd: new Date(s.etdUtc),
              eta: new Date(s.etaUtc),
              legEtas: [],
            },
          };
        }
      } catch {
        // API unavailable/vessel not found — fall through to the synthetic generator for every scenario.
      }
    }

    const buildForScenario = (sid: string, idx: number) => {
      const isCustom = sid === CUSTOM_SIMULATION_ID;

      // Real backend result available for this scenario — use it directly
      // (still splicing in the fixed prefix for a daily-re-optimization-style
      // partial run) instead of the synthetic generator below.
      const backendRoute = !isCustom ? backendResults[sid] : undefined;
      if (backendRoute) {
        const mergedPath =
          fixedPrefix.length > 1 ? [...fixedPrefix, ...backendRoute.path.slice(1)] : backendRoute.path;
        const mergedMetrics =
          fixedPrefix.length > 1
            ? computeRouteMetrics({
                path: mergedPath,
                speedKn: backendRoute.metrics.speedKn,
                etd: etdDate,
                market,
                consPerDay:
                  backendRoute.metrics.durationH > 0
                    ? backendRoute.metrics.fuelTons / Math.max(1e-6, backendRoute.metrics.durationH / 24)
                    : 22,
                ecaFraction:
                  backendRoute.metrics.distanceNm > 0
                    ? backendRoute.metrics.ecaDistanceNm / backendRoute.metrics.distanceNm
                    : undefined,
              })
            : backendRoute.metrics;
        return { ...backendRoute, path: mergedPath, metrics: mergedMetrics };
      }

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

      // Waypoint-level RPM/MCR overrides (Waypoint details panel) take
      // priority over the Limits & Constraints-derived custom speed for the
      // re-optimized portion of the route.
      const cpSpeedKn =
        waypointOverrideMatch?.speedKn ?? (isCustom ? customSpeedAdjusted : 12);

      const generated = generateOptimizedRoute({
        basePath: remainingPath,
        baseName: selected.label,
        scenarioId: baseScenarioId,
        market,
        etd: etdDate,
        cpSpeedKn,
        cpConsPerDay: isCustom ? customConsN : 22,
        // Guard against a cleared/incomplete date input — an Invalid Date
        // here would silently poison the resulting route's ETA (NaN math),
        // which later throws when formatted, so fall back to `null`.
        targetEta: isCustom && customRta
          ? safeDate(customRta)
          : sid === 'specific-eta'
            ? safeDate(targetEta)
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
    const targetEtaDate = isSpecificEta ? safeDate(targetEta) : null;
    addOptimizationResults(newRoutes, {
      baseRouteName: selected.label,
      scenarioId: scenarioIds.join(','),
      market,
      etd: etdDate.toISOString(),
      targetEta: targetEtaDate ? targetEtaDate.toISOString() : null,
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
    // Record every candidate in the permanent "All Routes" history too —
    // independent of whichever one (if any) the user ends up following —
    // so past runs' options and the criteria they were generated with are
    // never lost.
    const criteria: RouteHistoryCriteria = {
      scenarioId: scenarioIds.join(','),
      market,
      etd: etdDate.toISOString(),
      targetEta: targetEtaDate ? targetEtaDate.toISOString() : null,
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
    };
    appendRouteHistory(
      newRoutes.map((r) => ({
        id: `${r.id}-hist`,
        voyageId: voyage?.id,
        baseRouteName: selected.label,
        name: r.name,
        scenarioId: r.scenarioId,
        generatedAt: new Date().toISOString(),
        path: r.path,
        summary: {
          distanceNm: r.metrics.distanceNm,
          durationH: r.metrics.durationH,
          speedKn: r.metrics.speedKn,
          ecaDistanceNm: r.metrics.ecaDistanceNm,
          ecaDurationH: r.metrics.ecaDurationH,
          fuelTons: r.metrics.fuelTons,
          ecaFuelTons: r.metrics.ecaFuelTons,
          fuelCost: r.metrics.fuelCost,
          hireCost: r.metrics.hireCost,
          euaCost: r.metrics.euaCost,
          totalCost: r.metrics.totalCost,
          co2Tons: r.metrics.co2Tons,
          etdIso: r.metrics.etd.toISOString(),
          etaIso: r.metrics.eta.toISOString(),
        },
        criteria,
        // Lock the weather along this route right now, at generation time,
        // so the "View" link later shows what it actually looked like when
        // the route was run — not whatever the weather is by then.
        weather: buildFrozenWeatherSnapshot([
          { id: `${r.id}-hist`, label: r.name, color: r.color, path: r.path, hours: r.metrics.durationH },
        ]),
      })),
    );
    // Also lock the full map weather-overlay field for each candidate, right
    // now — saved separately (not inlined into the history entry) so the
    // permanent "All Routes" log doesn't carry this heavier data forever;
    // the "View" link's page fetches it lazily by the entry's id.
    newRoutes.forEach((r) => {
      const grids = buildFrozenWeatherGrids([
        { id: `${r.id}-hist`, label: r.name, color: r.color, path: r.path, hours: r.metrics.durationH },
      ]);
      saveHistoryWeatherGrids(`${r.id}-hist`, grids);
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

          {startAnchor.source === 'none' ? (
            <div className="fv-opt-pop__field">
              <div className="fv-opt-pop__grid">
                <label className="fv-opt-pop__field">
                  <span>{t('etd', 'ETD')}</span>
                  <input type="datetime-local" value={etd} onChange={(e) => setEtd(e.target.value)} />
                </label>
              </div>
              {waypointOverrideMatch && (
                <p className="fv-opt-pop__note">
                  <i className="fas fa-gauge" aria-hidden="true" />{' '}
                  Using Min/Max RPM/MCR set on {waypointOverrideMatch.count}{' '}
                  waypoint{waypointOverrideMatch.count === 1 ? '' : 's'} (~{waypointOverrideMatch.speedKn.toFixed(1)} kn) —
                  overriding the Limits &amp; Constraints speed for every scenario in this run.
                </p>
              )}
            </div>
          ) : (
            <div className="fv-opt-pop__field">
              <span>Resume optimization from</span>
              <div className="fv-opt-pop__anchor-options">
                <label
                  className={`fv-opt-pop__anchor-opt${anchorChoice === 'report' ? ' fv-opt-pop__anchor-opt--active' : ''}${!reportAnchorInfo ? ' fv-opt-pop__anchor-opt--disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name="fv-opt-anchor-source"
                    checked={anchorChoice === 'report'}
                    disabled={!reportAnchorInfo}
                    onChange={() => setAnchorChoice('report')}
                  />
                  <span className="fv-opt-pop__anchor-opt-text">
                    <span className="fv-opt-pop__anchor-opt-label">Last report (Tracksheet)</span>
                    <span className="fv-opt-pop__anchor-opt-desc">
                      {fmtAnchorLine(reportAnchorInfo, 'No validated report yet')}
                    </span>
                  </span>
                </label>
                <label
                  className={`fv-opt-pop__anchor-opt${anchorChoice === 'ais' ? ' fv-opt-pop__anchor-opt--active' : ''}${!aisAnchorInfo ? ' fv-opt-pop__anchor-opt--disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name="fv-opt-anchor-source"
                    checked={anchorChoice === 'ais'}
                    disabled={!aisAnchorInfo}
                    onChange={() => setAnchorChoice('ais')}
                  />
                  <span className="fv-opt-pop__anchor-opt-text">
                    <span className="fv-opt-pop__anchor-opt-label">Last AIS position</span>
                    <span className="fv-opt-pop__anchor-opt-desc">
                      {fmtAnchorLine(aisAnchorInfo, 'No AIS position available')}
                    </span>
                  </span>
                </label>
              </div>
              <span className="fv-opt-pop__desc">
                The route up to this position is kept unchanged; only the remaining route ahead of it is re-optimized.
              </span>
              {waypointOverrideMatch && (
                <p className="fv-opt-pop__note">
                  <i className="fas fa-gauge" aria-hidden="true" />{' '}
                  Using Min/Max RPM/MCR set on {waypointOverrideMatch.count}{' '}
                  waypoint{waypointOverrideMatch.count === 1 ? '' : 's'} ahead (~{waypointOverrideMatch.speedKn.toFixed(1)} kn) —
                  overriding the Limits &amp; Constraints speed for every scenario in this run.
                </p>
              )}
            </div>
          )}

          {isSpecificEta && (
            <div className="fv-opt-pop__grid">
              <label className="fv-opt-pop__field">
                <span>{t('targetEta', 'Target ETA')}</span>
                <input
                  type="datetime-local"
                  value={targetEta}
                  onChange={(e) => setTargetEta(e.target.value)}
                />
              </label>
            </div>
          )}

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
