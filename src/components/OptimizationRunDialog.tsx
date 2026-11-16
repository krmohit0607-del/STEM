import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useL } from '../i18n/LocalizationProvider';
import { useSelectedVoyage } from '../data/selectedVoyage';
import { imoForVoyage, useVessels } from '../data/vessels';
import { useSelectedLegNo } from '../data/selectedLeg';
import { useActiveSimRoute } from '../data/routeSimulatorStore';
import {
  DEFAULT_MARKET_FACTORS,
  OPTIMIZATION_SCENARIOS,
  SCENARIO_BY_ID,
  scenarioColor,
  haversineNM,
  pathDistanceNm,
  type LatLon,
  type OptimizedRoute,
} from '../data/routeMetrics';
import {
  optimizationApi,
  type OptimizationRestrictedAreaDto,
  type OptimizationRunResultApiDto,
} from '../api/optimizationApi';
import { addOptimizationResults, requestPanelView } from '../data/optimizationStore';
import { readSavedRoutesForVoyage } from '../data/savedRoutesStore';
import { appendRouteHistory, type RouteHistoryCriteria } from '../data/routeHistoryStore';
import { buildFrozenWeatherSnapshot, buildFrozenWeatherGrids } from '../data/routeWeatherSnapshot';
import { saveHistoryWeatherGrids } from '../data/routeSnapshotsStore';
import { loadLimitsFor } from '../data/limitsConstraints';
import { getEffectiveAreaConstraints, type AreaConstraint } from '../data/areaConstraints';
import { useVesselPosition } from '../data/vesselPosition';
import { loadOpsRecap } from '../data/opsRecap';
import { buildOperatingProfiles } from '../data/optimizationProfiles';
import { addNotification } from '../data/workflow';
import { useRouteReportMarkers } from '../data/routeReportMarkers';
import { normalizeLongitude, wrapLongitudeNear } from '../data/antimeridian';

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

/** Choices for each ranking weight (0 = ignore, 1 = normal). */
const IMPORTANCE_LEVELS = [
  { value: '0', text: '0 \u2013 Ignore' },
  { value: '1', text: '1 \u2013 Normal' },
  { value: '2', text: '2' },
  { value: '3', text: '3 \u2013 Important' },
  { value: '4', text: '4' },
  { value: '5', text: '5 \u2013 High' },
  { value: '6', text: '6' },
  { value: '7', text: '7' },
  { value: '8', text: '8' },
  { value: '9', text: '9' },
  { value: '10', text: '10 \u2013 Highest' },
] as const;

const WEIGHT_FIELDS = [
  { key: 'time', label: 'Importance: arrival time', hint: 'How much a shorter voyage counts when ranking the results. 1 = normal, 0 = ignore.' },
  { key: 'fuel', label: 'Importance: fuel used', hint: 'How much lower fuel use counts when ranking the results. 1 = normal, 0 = ignore.' },
  { key: 'cost', label: 'Importance: total cost', hint: 'How much a lower total cost counts when ranking the results. 1 = normal, 0 = ignore.' },
  { key: 'emissions', label: 'Importance: CO₂ emissions', hint: 'How much lower CO₂ emissions count when ranking the results. 1 = normal, 0 = ignore.' },
  { key: 'weather', label: 'Importance: avoiding bad weather', hint: 'How much less exposure to rough weather counts when ranking the results. 1 = normal, 0 = ignore.' },
] as const;

interface StartAnchor {
  source: 'none' | 'report' | 'ais';
  sourceLabel: string;
  startVertexIndex: number;
  startDateTimeIso: string | undefined;
  anchorPos: LatLon | null;
}

/** Dead reckoning is only trusted for a fix up to this old. */
const MAX_DEAD_RECKONING_HOURS = 72;

/**
 * Advance `distanceNm` along `path` starting at `from`, whose next route vertex
 * is `nextIdx`. Returns the new position and the index of the next vertex ahead,
 * or `null` when the distance runs past the end of the route.
 */
function advanceAlongPath(
  path: LatLon[],
  from: LatLon,
  nextIdx: number,
  distanceNm: number,
): { pos: LatLon; nextIdx: number } | null {
  let pos = from;
  let idx = nextIdx;
  let remaining = distanceNm;
  while (idx < path.length) {
    const target = path[idx];
    const leg = haversineNM(pos[0], pos[1], target[0], target[1]);
    if (remaining <= leg) {
      const fraction = leg > 0 ? remaining / leg : 0;
      const dLon = ((target[1] - pos[1] + 540) % 360) - 180;
      return { pos: [pos[0] + (target[0] - pos[0]) * fraction, pos[1] + dLon * fraction], nextIdx: idx };
    }
    remaining -= leg;
    pos = target;
    idx += 1;
  }
  return null;
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
  // `path` is on the same continuous numberline as the map rendering (e.g.
  // -223 instead of 137 once a route crosses the dateline), but every stored
  // area constraint ring is canonical (-180..180) — wrap each ring point
  // near the path's own longitude before comparing, or a dateline-crossing
  // corridor would silently match zero zones on the far side.
  const lonAnchor = path[0][1];

  const ringOverlapsBbox = (ring: [number, number][]): boolean => {
    for (const [lat, lng] of ring) {
      const wrappedLng = wrapLongitudeNear(lng, lonAnchor);
      if (lat >= minLat && lat <= maxLat && wrappedLng >= minLng && wrappedLng <= maxLng) return true;
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
      rings: c.rings.map((ring) => ring.map(([lat, lng]): [number, number] => [lng, lat])),
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
  const vesselImo = imoForVoyage(voyage, useVessels());
  const selectedLegNo = useSelectedLegNo();
  const vesselPos = useVesselPosition();
  const reportMarkers = useRouteReportMarkers();
  const t = (key: string, fallback: string) => {
    const v = l(key);
    return v === key ? fallback : v;
  };

  const activeRoute = useActiveSimRoute();
  const { loadCondition, profiles: operatingProfiles } = buildOperatingProfiles(voyage, selectedLegNo);
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
  const [arrivalRule, setArrivalRule] = useState<'ON' | 'BETWEEN' | 'BEFORE' | 'AFTER'>('ON');
  const [arrivalWindowEnd, setArrivalWindowEnd] = useState(() =>
    toLocalInput(new Date(Date.now() + 8 * 86400_000)),
  );
  const [savedVersion, setSavedVersion] = useState(0);
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const jobIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rollPeriod, setRollPeriod] = useState('');
  const [reserveVlsfo, setReserveVlsfo] = useState('');
  const [reserveLsmgo, setReserveLsmgo] = useState('');
  const [weights, setWeights] = useState({ time: '1', fuel: '1', cost: '1', emissions: '1', weather: '1' });
  const [solverLimit, setSolverLimit] = useState('90');
  const [includeEnsemble, setIncludeEnsemble] = useState(true);

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
  const voyageInPort = /in.?port|at.?berth|loading|discharging|anchorage/i.test(voyage?.status ?? '');
  const voyageAtSea = /at.?sea|underway|sailing/i.test(voyage?.status ?? '');
  const allSelected = scenarioIds.length === OPTIMIZATION_SCENARIOS.length;

  function latestReportAnchor(): { pos: LatLon; sourceLabel: string; dateTimeIso?: string; speedKts?: number | null; isDefault?: boolean } | null {
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
      sourceLabel: best.isDefault
        ? 'Planned departure (default Tracksheet position)'
        : best.dateTimeText ? `Last report (${best.dateTimeText})` : 'Last report position',
      dateTimeIso: best.dateTimeIso,
      speedKts: best.speedKts,
      isDefault: best.isDefault,
    };
  }

  function aisAnchor(): { pos: LatLon; sourceLabel: string; dateTimeIso?: string; speedKts?: number | null } | null {
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
    speedKts?: number | null;
    isDefault?: boolean;
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

  /**
   * Where the re-optimization starts. At sea the last report is usually older
   * than "now", so when the report carries a speed the position is advanced
   * along the route (dead reckoning) and the ETD becomes the current time; the
   * AIS position has no speed, so it is used as reported.
   */
  const buildStartAnchor = (nowMs: number): StartAnchor => {
    const none = (sourceLabel: string): StartAnchor => ({
      source: 'none',
      sourceLabel,
      startVertexIndex: 0,
      startDateTimeIso: undefined,
      anchorPos: null,
    });
    if (voyageInPort) return none('From first waypoint');
    if (!selected || selected.path.length < 2) return none('From departure');
    const anchor = resolveAnchor();
    if (!anchor) return none('From departure');

    const idx = nearestPathVertexIndex(selected.path, anchor.pos);
    const startVertexIndex = Math.min(Math.max(0, idx), selected.path.length - 2);
    // The vessel has not reported yet: it is still at the first waypoint, so it cannot leave before now.
    if (anchor.isDefault) {
      const plannedMs = anchor.dateTimeIso ? Date.parse(anchor.dateTimeIso) : Number.NaN;
      return {
        source: 'report',
        sourceLabel: anchor.sourceLabel,
        startVertexIndex,
        startDateTimeIso: new Date(Number.isFinite(plannedMs) ? Math.max(plannedMs, nowMs) : nowMs).toISOString(),
        anchorPos: anchor.pos,
      };
    }
    const fixMs = anchor.dateTimeIso ? Date.parse(anchor.dateTimeIso) : Number.NaN;
    const elapsedH = Number.isFinite(fixMs) ? (nowMs - fixMs) / 3_600_000 : Number.NaN;
    const speed = anchor.speedKts ?? 0;
    if (
      anchor.source === 'report' &&
      speed >= 0.5 &&
      speed <= 30 &&
      Number.isFinite(elapsedH) &&
      elapsedH >= 0.25 &&
      elapsedH <= MAX_DEAD_RECKONING_HOURS
    ) {
      const advanced = advanceAlongPath(selected.path, anchor.pos, startVertexIndex + 1, speed * elapsedH);
      if (advanced) {
        return {
          source: anchor.source,
          sourceLabel: `${anchor.sourceLabel} \u00b7 dead-reckoned +${elapsedH.toFixed(1)} h at ${speed.toFixed(1)} kn`,
          startVertexIndex: Math.min(Math.max(0, advanced.nextIdx - 1), selected.path.length - 2),
          startDateTimeIso: new Date(nowMs).toISOString(),
          anchorPos: advanced.pos,
        };
      }
    }
    return {
      source: anchor.source,
      sourceLabel: anchor.sourceLabel,
      startVertexIndex,
      startDateTimeIso: anchor.dateTimeIso,
      anchorPos: anchor.pos,
    };
  };

  const startAnchor = useMemo(
    () => buildStartAnchor(Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, reportMarkers, vesselPos, anchorChoice, voyageInPort],
  );

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
    if (running || !selected || selected.path.length < 2 || scenarioIds.length === 0) return;
    // Recompute at click time so an at-sea start is advanced to "now", not to when the dialog opened.
    const startAnchor = buildStartAnchor(Date.now());
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
    const customEcaFraction = Math.max(0, Math.min(1, (Number(customEcaPct) || 8) / 100));

    const startIndex = startAnchor.startVertexIndex;
    const fixedPrefix = startAnchor.anchorPos
      ? [...selected.path.slice(0, startIndex), startAnchor.anchorPos]
      : selected.path.slice(0, startIndex + 1);
    const remainingPath = startAnchor.anchorPos
      ? [startAnchor.anchorPos, ...selected.path.slice(startIndex + 1)]
      : selected.path.slice(startIndex);
    if (remainingPath.length < 2) return;

    setRunError('');
    if (!voyage) return;
    if (voyageAtSea && startAnchor.source === 'none') {
      setRunError('No vessel report or AIS position is available. The at-sea route was not changed.');
      return;
    }
    const targetEtaForApi = isSpecificEta ? safeDate(targetEta) : null;
    const arrivalWindowEndForApi = isSpecificEta && arrivalRule === 'BETWEEN' ? safeDate(arrivalWindowEnd) : null;
    const customRtaForApi = hasCustomSimulation && customRta ? safeDate(customRta) : null;
    if (hasCustomSimulation && customRta && (!customRtaForApi || customRtaForApi <= etdDate)) {
      setRunError('The Custom Simulation RTA must be a valid date and time after the departure time.');
      return;
    }
    const optionalNumber = (value: string): number | null => {
      const parsed = Number(value);
      return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const weightOf = (value: string): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
    };
    // The voyage's own weather margin (Operations ETA plan) gives the latest-ETA allowance.
    const etaPlan = loadOpsRecap(voyage?.id)?.etaPlan as { weatherMargin?: string } | undefined;
    const marginParsed = Number(etaPlan?.weatherMargin);
    const voyageWeatherMargin = Number.isFinite(marginParsed) && marginParsed > 0 && marginParsed < 100 ? marginParsed : null;
    if (isSpecificEta && !targetEtaForApi) {
      setRunError('Enter a valid arrival date and time.');
      return;
    }
    if (arrivalRule === 'BETWEEN' && (!arrivalWindowEndForApi || arrivalWindowEndForApi <= targetEtaForApi!)) {
      setRunError('The BETWEEN window end must be later than its start.');
      return;
    }
    const operatingProfilesForApi = operatingProfiles.map((profile) =>
      hasCustomSimulation && profile.mode === 'CUSTOM'
        ? { ...profile, speedKn: customSpeedN, dailyCons1Mt: customConsN }
        : profile,
    );
    const backendResults: Record<string, OptimizedRoute> = {};
    const maxDeviationNm = 60;
    const restrictedAreas = gatherRestrictedAreasForCorridor(remainingPath, voyage.id, maxDeviationNm);
    let apiResult: OptimizationRunResultApiDto | null = null;
    cancelRequestedRef.current = false;
    setRunning(true);
    setProgressPct(0);
    try {
      const started = await optimizationApi.startJob({
        voyageId: voyage.id,
        vesselImo,
        vesselName: voyage.vessel,
        deadweightMt: Number(String(voyage.dwt ?? '').replace(/[^0-9.]/g, '')) || undefined,
        scenarios: scenarioIds,
        etdUtc: etdDate.toISOString(),
        originLat: remainingPath[0][0],
        originLng: normalizeLongitude(remainingPath[0][1]),
        destLat: remainingPath[remainingPath.length - 1][0],
        destLng: normalizeLongitude(remainingPath[remainingPath.length - 1][1]),
        // The map-rendering path keeps longitude on a continuous numberline
        // across the dateline (e.g. -223 instead of 137) so the polyline
        // never jumps; the backend expects canonical WGS84 GeoJSON
        // coordinates (-180..180) and rejects anything outside that range.
        routeCoordinates: remainingPath.map(([lat, lng]): [number, number] => [normalizeLongitude(lng), lat]),
        loadCondition,
        operatingProfiles: operatingProfilesForApi,
        hireRatePerDayUsd: market.hirePerDay,
        foPriceUsdPerMt: market.foCost,
        goPriceUsdPerMt: market.goCost,
        euaPriceUsdPerTonneCo2: market.euaCost,
        arrivalRule: isSpecificEta ? arrivalRule : 'ON',
        targetEtaUtc: targetEtaForApi ? targetEtaForApi.toISOString() : null,
        arrivalWindowEndUtc: arrivalWindowEndForApi ? arrivalWindowEndForApi.toISOString() : null,
        customRpmMin: Number.isFinite(customRpmMinN) ? customRpmMinN : null,
        customRpmMax: Number.isFinite(customRpmMaxN) ? customRpmMaxN : null,
        customMcrMin: Number.isFinite(customMcrMinN) ? customMcrMinN : null,
        customMcrMax: Number.isFinite(customMcrMaxN) ? customMcrMaxN : null,
        customDraftM: hasCustomSimulation ? optionalNumber(customDraft) : null,
        customDisplacementMt: hasCustomSimulation ? optionalNumber(customDisplacement) : null,
        customGmM: hasCustomSimulation ? optionalNumber(customGm) : null,
        customRtaUtc: customRtaForApi ? customRtaForApi.toISOString() : null,
        rollPeriodSec: optionalNumber(rollPeriod),
        weatherMarginPct: voyageWeatherMargin,
        minReserveVlsfoMt: optionalNumber(reserveVlsfo),
        minReserveLsmgoMt: optionalNumber(reserveLsmgo),
        solverTimeLimitSeconds: optionalNumber(solverLimit),
        includeEnsemble,
        rankingWeights: {
          time: weightOf(weights.time),
          fuel: weightOf(weights.fuel),
          cost: weightOf(weights.cost),
          emissions: weightOf(weights.emissions),
          weather: weightOf(weights.weather),
        },
        maxDeviationNm,
        restrictedAreas,
      });
      jobIdRef.current = started.jobId;
      let status = started;
      let pollFailures = 0;
      while (status.status === 'Queued' || status.status === 'Running') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (cancelRequestedRef.current || !mountedRef.current) return;
        try {
          status = await optimizationApi.getJob(started.jobId);
          pollFailures = 0;
        } catch (pollError) {
          pollFailures += 1;
          if (pollFailures >= 3) throw pollError;
          continue;
        }
        setProgressPct(status.percent);
      }
      if (status.status === 'Cancelled') return;
      if (status.status !== 'Completed' || !status.result) {
        setRunError(status.error || 'The optimization did not complete.');
        return;
      }
      apiResult = status.result;
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'The optimization API could not complete this run.');
      return;
    } finally {
      jobIdRef.current = null;
      if (mountedRef.current) setRunning(false);
    }
    if (!apiResult) return;

    const infeasibleMessages: string[] = [];
    for (const scenario of apiResult.scenarios) {
      if (!scenario.isFeasible || scenario.waypoints.length < 2) {
        infeasibleMessages.push(`${SCENARIO_BY_ID[scenario.scenario]?.label ?? scenario.scenario}: ${scenario.infeasibleReason || 'No feasible route was returned.'}`);
        continue;
      }
      backendResults[scenario.scenario] = {
        id: `opt-${scenario.scenario}-${apiResult.optimizationRunId}`,
        scenarioId: scenario.scenario,
        name: scenario.scenario === CUSTOM_SIMULATION_ID ? 'Custom Simulation' : SCENARIO_BY_ID[scenario.scenario]?.label ?? scenario.scenario,
        color: scenarioColor(scenario.scenario),
        path: scenario.waypoints.map((waypoint): LatLon => [waypoint.lat, waypoint.lng]),
        metrics: {
          distanceNm: scenario.distanceNm,
          ecaDistanceNm: scenario.ecaDistanceNm,
          speedKn: scenario.averageSpeedKn,
          durationH: scenario.timeToGoHours,
          ecaDurationH: scenario.ecaTimeToGoHours,
          fuelTons: scenario.meFuelRequiredToGoMt,
          ecaFuelTons: scenario.ecaFuelRequiredToGoMt,
          fuelCost: scenario.fuelCostToGoUsd,
          hireCost: scenario.timeCostToGoUsd,
          co2Tons: scenario.meCo2EmissionsToGoMt,
          euaAllowanceTons: scenario.meCo2EmissionsToGoMt,
          euaCost: scenario.emissionsCostToGoUsd,
          totalCost: scenario.totalCostToGoUsd,
          etd: new Date(scenario.etdUtc),
          eta: new Date(scenario.etaUtc),
          legEtas: [],
        },
        analysis: scenario.analysis,
        warnings: scenario.warnings,
        runId: apiResult.optimizationRunId,
      };
    }

    const newRoutes = scenarioIds.flatMap((scenarioId) => {
      const backendRoute = backendResults[scenarioId];
      if (!backendRoute) return [];
      const mergedPath = fixedPrefix.length > 1
        ? [...fixedPrefix, ...backendRoute.path.slice(1)]
        : backendRoute.path;
      return [{ ...backendRoute, path: mergedPath }];
    });
    const notices = [...infeasibleMessages];
    for (const scenario of apiResult.scenarios) {
      if (!scenario.isFeasible) continue;
      const label = SCENARIO_BY_ID[scenario.scenario]?.label ?? scenario.scenario;
      (scenario.warnings ?? [])
        .filter((warning) => /exceeds limit|above a vessel weather limit|waiting at the anchorage|too little observed/.test(warning))
        .forEach((warning) => notices.push(`${label}: ${warning}`));
    }
    notices.forEach((notice) => addNotification(notice, 'Optimization'));
    if (infeasibleMessages.length > 0) setRunError(infeasibleMessages.join(' '));
    if (newRoutes.length === 0) {
      if (infeasibleMessages.length === 0) setRunError('The optimization API returned no route results.');
      return;
    }
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
      arrivalRule: isSpecificEta ? arrivalRule : undefined,
      arrivalWindowEnd: arrivalWindowEndForApi ? arrivalWindowEndForApi.toISOString() : null,
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

  /** Closing while a job is running cancels it on the server too. */
  const handleClose = () => {
    if (running) {
      cancelRequestedRef.current = true;
      const jobId = jobIdRef.current;
      if (jobId) void optimizationApi.cancelJob(jobId).catch(() => undefined);
    }
    onClose();
  };

  return createPortal(
    <div className="fv-opt-pop__overlay" role="presentation" onClick={handleClose}>
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
            onClick={handleClose}
            aria-label={t('close', 'Close')}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="fv-opt-pop__body">
          {runError && <p className="fv-opt-pop__note fv-opt-pop__note--error" role="alert">{runError}</p>}
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
                <span>Arrival timing</span>
                <select value={arrivalRule} onChange={(e) => setArrivalRule(e.target.value as typeof arrivalRule)}>
                  <option value="ON">ON</option>
                  <option value="BETWEEN">BETWEEN</option>
                  <option value="BEFORE">BEFORE</option>
                  <option value="AFTER">AFTER</option>
                </select>
              </label>
              <label className="fv-opt-pop__field">
                <span>{arrivalRule === 'BETWEEN' ? 'Window starts' : arrivalRule === 'BEFORE' ? 'Arrive by' : arrivalRule === 'AFTER' ? 'Not before' : t('targetEta', 'Target ETA')}</span>
                <input
                  type="datetime-local"
                  value={targetEta}
                  onChange={(e) => setTargetEta(e.target.value)}
                />
              </label>
              {arrivalRule === 'BETWEEN' && (
                <label className="fv-opt-pop__field">
                  <span>Window ends</span>
                  <input
                    type="datetime-local"
                    value={arrivalWindowEnd}
                    onChange={(e) => setArrivalWindowEnd(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          <div className="fv-opt-pop__factors">
            <button
              type="button"
              className="fv-opt-pop__factors-title"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              <i className={`fas ${showAdvanced ? 'fa-chevron-down' : 'fa-chevron-right'}`} aria-hidden="true" /> More options (optional)
            </button>
            {showAdvanced && (
              <div className="fv-opt-pop__grid">
                <label className="fv-opt-pop__field" title="Time the ship takes to roll once, from the stability booklet. Used to warn about dangerous rolling in waves. Leave empty to skip this check.">
                  <span>Ship roll time (seconds)</span>
                  <input type="number" value={rollPeriod} onChange={(e) => setRollPeriod(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field" title="The route must always keep at least this much VLSFO on board. Routes that would go below it are rejected. Leave empty for no minimum.">
                  <span>Keep at least this much VLSFO (MT)</span>
                  <input type="number" value={reserveVlsfo} onChange={(e) => setReserveVlsfo(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field" title="The route must always keep at least this much LSMGO on board. Routes that would go below it are rejected. Leave empty for no minimum.">
                  <span>Keep at least this much LSMGO (MT)</span>
                  <input type="number" value={reserveLsmgo} onChange={(e) => setReserveLsmgo(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field" title="The longest the optimizer may work on each scenario. If time runs out, you get the best quick result instead of the most detailed one.">
                  <span>Maximum calculation time per scenario (seconds)</span>
                  <input type="number" min="5" value={solverLimit} onChange={(e) => setSolverLimit(e.target.value)} />
                </label>
                <label className="fv-opt-pop__field" title="Re-runs each chosen route with different possible wind forecasts to show how much the arrival time and fuel could vary. Wind only; takes extra time.">
                  <span>Check wind forecast uncertainty</span>
                  <select value={includeEnsemble ? 'on' : 'off'} onChange={(e) => setIncludeEnsemble(e.target.value === 'on')}>
                    <option value="on">Yes (wind only)</option>
                    <option value="off">No</option>
                  </select>
                </label>
                {WEIGHT_FIELDS.map(({ key, label, hint }) => (
                  <label key={key} className="fv-opt-pop__field" title={hint}>
                    <span>{label}</span>
                    <select
                      value={weights[key]}
                      onChange={(e) => setWeights((prev) => ({ ...prev, [key]: e.target.value }))}
                    >
                      {IMPORTANCE_LEVELS.map(({ value, text }) => (
                        <option key={value} value={value}>{text}</option>
                      ))}
                    </select>
                  </label>
                ))}
                <p className="fv-opt-pop__note" style={{ gridColumn: '1 / -1' }}>
                  The &ldquo;Importance&rdquo; levels (0 to 10) decide which result is listed first when comparing scenarios. 1 = normal, higher = more important, 0 = ignore. They do not change the routes themselves.
                </p>
              </div>
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
          <button type="button" className="fv-opt-pop__btn" onClick={handleClose}>
            {t('cancel', 'Cancel')}
          </button>
          <button
            type="button"
            className="fv-opt-pop__btn fv-opt-pop__btn--primary"
            onClick={run}
            disabled={running || !selected || scenarioIds.length === 0}
          >
            <i className={running ? 'fas fa-spinner fa-spin' : 'fas fa-play'} aria-hidden="true" />{' '}
            {running
              ? `${t('optimizing', 'Optimizing')}\u2026 ${progressPct}%`
              : scenarioIds.length > 1
                ? `${t('run', 'Run optimization')} (${scenarioIds.length})`
                : t('run', 'Run optimization')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
