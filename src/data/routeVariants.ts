import {
  findBestOptimizedRoute,
  interiorLandSamples,
  haversineNM,
  type OptimizedRoute,
  type LatLon,
} from './routeOptimizer';

/** Presentation metadata for a candidate route (shared with the UI). */
export interface RouteVariantMeta {
  id: string;
  label: string;
  description: string;
  color: string;
}

export const ROUTE_VARIANTS: RouteVariantMeta[] = [
  {
    id: 'optimal',
    label: 'Optimal',
    description: 'Weather-aware best path',
    color: '#2ea043',
  },
  {
    id: 'shortest',
    label: 'Shortest',
    description: 'Minimum distance, still avoiding land',
    color: '#f0a020',
  },
  {
    id: 'altA',
    label: 'Alternative A',
    description: 'A distinct alternative corridor',
    color: '#58a6ff',
  },
  {
    id: 'altB',
    label: 'Alternative B',
    description: 'Another distinct corridor',
    color: '#bc6ff1',
  },
];

/**
 * How much interior land contact (in densely-sampled points) a route may still
 * have and be considered land-avoiding. A tiny residual (1–2 points) only
 * happens at straits narrower than the search grid; anything more means the
 * track genuinely ploughs across land and is rejected.
 */
const LAND_SAMPLE_TOLERANCE = 3;

/**
 * Minimum peak separation (NM) between two tracks for them to count as
 * genuinely different options. Candidates that never diverge this far from an
 * already-shown route are dropped as duplicates.
 */
const DISTINCT_MIN_NM = 150;

/** Resample a path into `k` points spaced evenly along its arc length. */
function resampleByLength(path: Array<[number, number]>, k: number): LatLon[] {
  const pts = path.map(([lat, lon]) => ({ lat, lon }));
  if (pts.length <= 1) return pts.length ? [pts[0], pts[0]] : [];
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    cum.push(cum[i - 1] + haversineNM(pts[i - 1], pts[i]));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: k }, () => pts[0]);
  const out: LatLon[] = [];
  let seg = 1;
  for (let s = 0; s < k; s += 1) {
    const target = (total * s) / (k - 1);
    while (seg < pts.length - 1 && cum[seg] < target) seg += 1;
    const segLen = cum[seg] - cum[seg - 1] || 1;
    const f = Math.min(1, Math.max(0, (target - cum[seg - 1]) / segLen));
    const a = pts[seg - 1];
    const b = pts[seg];
    out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
  }
  return out;
}

/** Largest separation (NM) between two tracks, comparing arc-aligned samples. */
function maxDeviationNm(
  a: Array<[number, number]>,
  b: Array<[number, number]>,
): number {
  const k = 24;
  const ra = resampleByLength(a, k);
  const rb = resampleByLength(b, k);
  let max = 0;
  for (let i = 0; i < Math.min(ra.length, rb.length); i += 1) {
    const d = haversineNM(ra[i], rb[i]);
    if (d > max) max = d;
  }
  return max;
}

/**
 * A margin (degrees) large enough that a search box built from the direct
 * dep→arr extent will still contain the whole of `path` (plus room for an
 * alternate to bulge outward). Lets alternate searches reuse the corridor the
 * optimal route already proved is at sea, without paying for box escalation.
 */
function marginToCover(
  path: Array<[number, number]>,
  dep: LatLon,
  arr: LatLon,
): number {
  const latLo = Math.min(dep.lat, arr.lat);
  const latHi = Math.max(dep.lat, arr.lat);
  const depLon = dep.lon;
  let arrLon = arr.lon;
  while (arrLon - depLon > 180) arrLon -= 360;
  while (arrLon - depLon < -180) arrLon += 360;
  const lonLo = Math.min(depLon, arrLon);
  const lonHi = Math.max(depLon, arrLon);
  let m = 6;
  for (const [lat, lon] of path) {
    let plon = lon;
    while (plon - depLon > 180) plon -= 360;
    while (plon - depLon < -180) plon += 360;
    m = Math.max(m, latLo - lat, lat - latHi, lonLo - plon, plon - lonHi);
  }
  return Math.min(72, m + 8);
}

/** Callback used to stream each accepted, land-clean, distinct route. */
export type EmitVariant = (id: string, info: OptimizedRoute) => void;

/**
 * Compute the candidate routes and stream each land-clean, genuinely distinct
 * one to `emit`. The optimal route is always emitted; the shortest and two
 * penalty-steered alternatives are emitted only when they meaningfully differ
 * from what has already been shown, so the user never sees near-duplicates.
 * Returns the number of routes emitted.
 */
export function computeRouteVariants(
  dep: LatLon,
  arr: LatLon,
  emit: EmitVariant,
): number {
  const acceptedPaths: Array<Array<[number, number]>> = [];
  let emitted = 0;

  const accept = (
    id: string,
    info: OptimizedRoute | null,
    force = false,
  ): void => {
    if (!info || info.path.length < 2) return;
    if (interiorLandSamples(info.path, dep, arr) > LAND_SAMPLE_TOLERANCE) return;
    if (!force) {
      for (const ap of acceptedPaths) {
        if (maxDeviationNm(info.path, ap) < DISTINCT_MIN_NM) return; // duplicate
      }
    }
    acceptedPaths.push(info.path);
    emitted += 1;
    emit(id, info);
  };

  // Primary optimum — always shown, and used to size the alternate search box.
  const optimal = findBestOptimizedRoute(dep, arr);
  accept('optimal', optimal, true);

  // Shortest navigable route: its own tight box (with escalation) so it finds
  // the true minimum-distance corridor rather than being widened to the
  // optimum's weather detour.
  const shortest = findBestOptimizedRoute(dep, arr, { hazardAware: false });
  accept('shortest', shortest);

  // Distinct alternatives: steer away from the already-shown tracks. Reuse the
  // optimum's proven corridor as a fixed search box so these are a single pass
  // (no escalation) yet still land-clean, with room to bulge outward.
  const coverMargin = marginToCover(optimal.path, dep, arr);
  const boxOpts = { gridMarginDeg: coverMargin, maxNodes: 120000 };

  const altA = findBestOptimizedRoute(dep, arr, {
    ...boxOpts,
    avoidPaths: acceptedPaths.map((p) => p),
    avoidRadiusDeg: 6,
    avoidPenaltyPerNm: 380,
  });
  accept('altA', altA);

  const altB = findBestOptimizedRoute(dep, arr, {
    ...boxOpts,
    avoidPaths: acceptedPaths.map((p) => p),
    avoidRadiusDeg: 6,
    avoidPenaltyPerNm: 560,
  });
  accept('altB', altB);

  return emitted;
}

/** Best-effort route used when nothing could be emitted. */
export function computeFallbackRoute(dep: LatLon, arr: LatLon): OptimizedRoute {
  return findBestOptimizedRoute(dep, arr);
}
