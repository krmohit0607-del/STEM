/**
 * Weather- and hazard-aware route optimizer.
 *
 * `findBestOptimizedRoute()` searches for the lowest-cost navigable track
 * between two points. Unlike a plain great-circle it does real pathfinding
 * (A* over a lat/lon grid) so the route can bend around obstacles instead of
 * cutting straight through them. The cost that A* minimises folds in every
 * factor the bridge cares about:
 *
 *   1. Distance         — shorter is cheaper (base fuel burn per nautical mile).
 *   2. Land / coast     — a global land mask (Natural Earth polygons) makes
 *                         real land an impassable obstacle, and the imported
 *                         coastal area-constraint buffers keep the route out of
 *                         shallow inshore water. The final track is then pulled
 *                         into great-circle arcs that never cross land.
 *   3. Area constraints — no-go / limited-passage / ECA / speed-control zones
 *                         from `AREA_CONSTRAINTS` are avoided (no-go the hardest).
 *   4. Heavy weather    — significant wave height & wind inflate fuel burn and
 *                         add a comfort/safety penalty above a threshold.
 *   5. Ice              — iceberg-risk latitudes/regions are strongly avoided.
 *   6. Cyclone          — tropical-storm-risk cells are strongly avoided.
 *   7. Fuel             — the whole cost is expressed in fuel-tonne equivalents,
 *                         so the winning route is the minimum-fuel feasible one.
 *
 * The environmental fields (`sampleEnvironment`) are self-contained, smoothly
 * varying stand-ins today. They are deliberately isolated so they can be
 * swapped for live feeds (Open-Meteo waves/wind, ice charts, cyclone tracks)
 * without touching the search itself.
 */

import { AREA_CONSTRAINTS } from './areaConstraints';
import { isLand } from './landMask';

/**
 * Land avoidance penalty (fuel-tonne equivalents per NM). Much larger than any
 * zone penalty so the search treats real land as an effectively impassable
 * obstacle and bends the route around coastlines.
 */
const LAND_PENALTY_PER_NM = 25000;

/**
 * Softer penalty for open-water cells that sit right next to land. It nudges
 * the route a cell offshore (so it does not clip the coast) without closing
 * genuine straits, which stay passable at a modest cost.
 */
const COAST_BUFFER_PENALTY_PER_NM = 450;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Hazards the chosen route still touches (for UI annotation). */
export interface RouteHazards {
  land: boolean;
  areaConstraints: boolean;
  heavyWeather: boolean;
  ice: boolean;
  cyclone: boolean;
}

export interface OptimizedRoute {
  /** Ordered `[lat, lon]` samples describing the chosen track. */
  path: Array<[number, number]>;
  /** Total great-circle distance of the track (NM). */
  distanceNm: number;
  /** Estimated fuel burn for the track (metric tonnes). */
  fuelTons: number;
  /** A* cost score used to rank the route (fuel-tonne equivalents; lower better). */
  cost: number;
  /** Mean heavy-weather penalty along the track, roughly `[0, 1]`. */
  weatherPenalty: number;
  /** Hazards the final route still passes near. */
  hazards: RouteHazards;
}

export interface OptimizeOptions {
  /** Extra degrees of search area around the direct track (room to detour). */
  gridMarginDeg?: number;
  /** Upper bound on grid nodes (search resolution auto-scales to stay under). */
  maxNodes?: number;
  /** How strongly heavy weather inflates cost beyond its fuel effect. */
  weatherWeight?: number;
  /** Calm-water fuel burn, metric tonnes per nautical mile. */
  baseFuelPerNm?: number;
  /** Honour the imported area constraints (no-go / coastal / ECA). */
  avoidConstraints?: boolean;
  /**
   * When `true` (default) the cost folds in weather, ice and cyclone risk so
   * the route detours around hazards. When `false` the search minimises pure
   * distance while still avoiding land/coast and hard zones — i.e. the
   * shortest navigable route.
   */
  hazardAware?: boolean;
  /**
   * When `true`, skip the adaptive search-box widening that
   * `findBestOptimizedRoute` normally applies if a track still crosses land.
   * Used for cheap secondary passes (e.g. corridor legs) that are validated and
   * discarded by the caller instead.
   */
  noEscalate?: boolean;
  /**
   * Already-chosen tracks (each an array of `[lat, lon]`) that this search
   * should steer away from, so the result is a *genuinely different* corridor.
   * Grid cells within `avoidRadiusDeg` of any of these tracks get an additive
   * per-NM penalty that tapers to zero at the edge of the band. Land avoidance
   * still dominates, so the alternate stays at sea.
   */
  avoidPaths?: Array<Array<[number, number]>>;
  /** Half-width (degrees) of the steer-away band. Default 5. */
  avoidRadiusDeg?: number;
  /** Peak per-NM penalty at the centre of the steer-away band. Default 340. */
  avoidPenaltyPerNm?: number;
}

const R_NM = 3440.065; // Earth radius in nautical miles.
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Wrap a longitude into [-180, 180). */
const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Great-circle distance in nautical miles. */
export function haversineNM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** `segments + 1` great-circle samples from `a` to `b`. */
function greatCircle(a: LatLon, b: LatLon, segments: number): LatLon[] {
  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lon);
  const φ2 = toRad(b.lat);
  const λ2 = toRad(b.lon);
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((φ2 - φ1) / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
        ),
      ),
    );
  if (d === 0) return [a, b];
  const out: LatLon[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push({ lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon: toDeg(Math.atan2(y, x)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Environmental model (synthetic, swappable for real feeds).
// ---------------------------------------------------------------------------

export interface Environment {
  /** Significant wave height (m). */
  waveHeight: number;
  /** Wind speed (kn). */
  windSpeed: number;
  /** Iceberg / sea-ice risk, 0–1. */
  iceRisk: number;
  /** Tropical-cyclone risk, 0–1. */
  cycloneRisk: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Sample the (synthetic) marine environment at a point. Smoothly varying so
 * the optimizer can meaningfully steer around rough patches. Replace the body
 * with a real sampler (e.g. Open-Meteo marine grid + ice/cyclone charts) to
 * optimize against live conditions without changing the search.
 */
export function sampleEnvironment(lat: number, lon: number): Environment {
  const absLat = Math.abs(lat);

  // Storm belts: Southern Ocean "roaring forties/fifties" and the mid-latitude
  // North Atlantic/Pacific, plus gentle sinusoidal texture so the field is not
  // perfectly banded.
  const southernOcean = 5.2 * Math.exp(-(((lat + 50) / 11) ** 2));
  const northern = 3.4 * Math.exp(-(((lat - 52) / 13) ** 2));
  const texture =
    0.9 * Math.sin(lat * 0.19 + lon * 0.13) +
    0.7 * Math.cos((lat + lon) * 0.08) +
    0.6 * Math.sin(lon * 0.11 - lat * 0.05);
  const waveHeight = Math.max(0.4, 1.2 + southernOcean + northern + texture);

  // Wind roughly tracks the wave field.
  const windSpeed = Math.max(3, waveHeight * 4.2 + 3 * Math.sin(lon * 0.1 + lat * 0.07));

  // Ice risk ramps up toward the poles, with extra weight over the classic
  // iceberg grounds (Labrador Sea / Grand Banks, Greenland, Southern Ocean).
  let iceRisk = 0;
  if (lat > 58) iceRisk = clamp01((lat - 58) / 12);
  else if (lat < -58) iceRisk = clamp01((-lat - 58) / 10);
  if (lat > 40 && lat < 58 && lon > -62 && lon < -38) {
    iceRisk = Math.max(iceRisk, clamp01((lat - 40) / 18) * 0.85); // Grand Banks
  }

  // Cyclone risk concentrates in the tropical bands (roughly 7°–22° off the
  // equator), tapering to zero at the equator and mid-latitudes.
  const band = Math.exp(-(((absLat - 15) / 6.5) ** 2));
  const basin = 0.5 + 0.5 * Math.sin(lon * 0.06 + lat * 0.04);
  const cycloneRisk = absLat < 30 ? clamp01(band * basin) : 0;

  return { waveHeight, windSpeed, iceRisk, cycloneRisk };
}

/** Heavy-weather penalty (0–1+) — grows sharply once seas get rough. */
function heavyWeatherPenalty(env: Environment): number {
  const wave = Math.max(0, env.waveHeight - 3); // calm below ~3 m
  return wave * wave * 0.06 + Math.max(0, env.windSpeed - 22) * 0.01;
}

/** Extra fuel resistance (fractional) from wind and waves. */
function weatherResistance(env: Environment): number {
  return 0.11 * env.waveHeight ** 1.25 + 0.006 * env.windSpeed;
}

// ---------------------------------------------------------------------------
// Area constraints (land / coast / no-go / ECA) as routing obstacles.
// ---------------------------------------------------------------------------

interface PreppedRing {
  ring: [number, number][];
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface PreppedConstraint {
  zoneType: string;
  /** Avoidance penalty in fuel-tonne-equivalents per nautical mile. */
  penaltyPerNm: number;
  rings: PreppedRing[];
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** How hard each zone type is avoided (fuel-tonne equivalents per NM). */
function zonePenalty(zoneType: string): number {
  switch (zoneType) {
    case 'no-go-zone':
      return 6000;
    case 'limited-passage-zone':
      return 900;
    case 'speed-control-zone':
      return 120;
    case 'eca-zone':
      return 60;
    default:
      return 900; // unknown coastal/limited zones: treat as strong avoid
  }
}

const PREPPED_CONSTRAINTS: PreppedConstraint[] = AREA_CONSTRAINTS.map((c) => {
  const rings: PreppedRing[] = c.rings.map((ring) => {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (const [la, lo] of ring) {
      if (la < minLat) minLat = la;
      if (la > maxLat) maxLat = la;
      if (lo < minLon) minLon = lo;
      if (lo > maxLon) maxLon = lo;
    }
    return { ring, minLat, maxLat, minLon, maxLon };
  });
  return {
    zoneType: c.zoneType,
    penaltyPerNm: zonePenalty(c.zoneType),
    rings,
    minLat: Math.min(...rings.map((r) => r.minLat)),
    maxLat: Math.max(...rings.map((r) => r.maxLat)),
    minLon: Math.min(...rings.map((r) => r.minLon)),
    maxLon: Math.max(...rings.map((r) => r.maxLon)),
  };
});

/** Ray-casting point-in-polygon test (x = lon, y = lat). */
function pointInRing(lat: number, lon: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Highest area-constraint penalty at a point among the candidate constraints,
 * plus whether the hit was a hard obstacle (no-go / coastal / limited passage).
 */
function areaPenaltyAt(
  lat: number,
  lon: number,
  candidates: PreppedConstraint[],
): { penalty: number; hardObstacle: boolean } {
  let penalty = 0;
  let hardObstacle = false;
  for (const c of candidates) {
    if (lat < c.minLat || lat > c.maxLat || lon < c.minLon || lon > c.maxLon) continue;
    for (const r of c.rings) {
      if (lat < r.minLat || lat > r.maxLat || lon < r.minLon || lon > r.maxLon) continue;
      if (pointInRing(lat, lon, r.ring)) {
        if (c.penaltyPerNm > penalty) penalty = c.penaltyPerNm;
        if (c.penaltyPerNm >= 900) hardObstacle = true;
        break;
      }
    }
  }
  return { penalty, hardObstacle };
}

// ---------------------------------------------------------------------------
// Binary min-heap for A*.
// ---------------------------------------------------------------------------

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const topId = this.ids[0];
    const lastId = this.ids.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      const n = this.ids.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < n && this.keys[l] < this.keys[s]) s = l;
        if (r < n && this.keys[r] < this.keys[s]) s = r;
        if (s === i) break;
        this.swap(i, s);
        i = s;
      }
    }
    return topId;
  }

  private swap(a: number, b: number): void {
    const ti = this.ids[a];
    this.ids[a] = this.ids[b];
    this.ids[b] = ti;
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
  }
}

// ---------------------------------------------------------------------------
// Optimizer.
// ---------------------------------------------------------------------------

/**
 * Find the best (minimum-fuel, hazard-avoiding) navigable route between two
 * points using A* over an adaptive lat/lon grid. Longitudes are unwrapped
 * relative to the departure so tracks that cross the antimeridian search
 * correctly.
 */
export function findBestOptimizedRoute(
  departure: LatLon,
  arrival: LatLon,
  options: OptimizeOptions = {},
): OptimizedRoute {
  // First pass with the caller's options (or defaults).
  let best = searchRoute(departure, arrival, options);
  let bestLand = interiorLandSamples(best.path, departure, arrival);

  // If the track still crosses land in its interior and the caller did not pin
  // the search box, progressively widen the search area (raising the node
  // budget to preserve resolution) until a sea route is found. This lets long
  // voyages find continental-scale detours (e.g. rounding a cape) that a small
  // box around the direct line would otherwise force through land.
  if (bestLand > 0 && options.gridMarginDeg === undefined && !options.noEscalate) {
    const escalations: Array<Pick<OptimizeOptions, 'gridMarginDeg' | 'maxNodes'>> = [
      { gridMarginDeg: 45, maxNodes: 70000 },
      { gridMarginDeg: 62, maxNodes: 110000 },
    ];
    for (const esc of escalations) {
      const attempt = searchRoute(departure, arrival, { ...options, ...esc });
      const land = interiorLandSamples(attempt.path, departure, arrival);
      if (land < bestLand) {
        best = attempt;
        bestLand = land;
      }
      if (bestLand === 0) break;
    }
  }
  return best;
}

/**
 * Number of densely-sampled points along the interior of `path` (excluding the
 * coastal band near either endpoint, since ports sit on land) that fall on
 * land. 0 means the route is clear of land between its port approaches.
 */
export function interiorLandSamples(
  path: Array<[number, number]>,
  departure: LatLon,
  arrival: LatLon,
): number {
  if (path.length < 2) return 0;
  const near = (lat: number, lon: number, p: LatLon) => {
    const dLon = ((lon - p.lon + 540) % 360) - 180;
    return Math.hypot(lat - p.lat, dLon) < 1.5;
  };
  let count = 0;
  for (let i = 1; i < path.length; i += 1) {
    const [aLat, aLon] = path[i - 1];
    const [bLat, bLon] = path[i];
    const dLon = ((bLon - aLon + 540) % 360) - 180;
    const steps = Math.max(2, Math.ceil(Math.hypot(bLat - aLat, dLon) * 4));
    for (let s = 1; s < steps; s += 1) {
      const f = s / steps;
      const lat = aLat + (bLat - aLat) * f;
      const lon = wrapLon(aLon + dLon * f);
      if (near(lat, lon, departure) || near(lat, lon, arrival)) continue;
      if (isLand(lat, lon)) count += 1;
    }
  }
  return count;
}

/**
 * Core A* search over an adaptive lat/lon grid. Callers normally use
 * `findBestOptimizedRoute`, which wraps this with adaptive box widening.
 */
function searchRoute(
  departure: LatLon,
  arrival: LatLon,
  options: OptimizeOptions = {},
): OptimizedRoute {
  const {
    gridMarginDeg,
    maxNodes = 40000,
    weatherWeight = 40,
    baseFuelPerNm = 0.1,
    avoidConstraints = true,
    hazardAware = true,
    avoidPaths,
    avoidRadiusDeg = 5,
    avoidPenaltyPerNm = 340,
  } = options;

  // Densify the steer-away tracks into a bounded set of sample points (in
  // wrapped-lon space) so cells near an already-chosen route can be penalised.
  const avoidPts: Array<{ lat: number; lon: number }> = [];
  if (avoidPaths && avoidPaths.length > 0) {
    const spacing = Math.max(0.75, avoidRadiusDeg / 2);
    for (const p of avoidPaths) {
      for (let i = 1; i < p.length; i += 1) {
        const [aLat, aLon] = p[i - 1];
        const [bLat, bLon] = p[i];
        const dLon = ((bLon - aLon + 540) % 360) - 180;
        const segLen = Math.hypot(bLat - aLat, dLon);
        const steps = Math.max(1, Math.round(segLen / spacing));
        for (let s = 0; s < steps; s += 1) {
          const f = s / steps;
          avoidPts.push({ lat: aLat + (bLat - aLat) * f, lon: wrapLon(aLon + dLon * f) });
        }
      }
      if (p.length > 0) {
        const last = p[p.length - 1];
        avoidPts.push({ lat: last[0], lon: last[1] });
      }
    }
  }
  const hasAvoid = avoidPts.length > 0;

  // Unwrap arrival longitude to be within 180° of the departure so the grid is
  // continuous across the antimeridian.
  const depLon = departure.lon;
  let arrLon = arrival.lon;
  while (arrLon - depLon > 180) arrLon -= 360;
  while (arrLon - depLon < -180) arrLon += 360;
  const dep: LatLon = { lat: departure.lat, lon: depLon };
  const arr: LatLon = { lat: arrival.lat, lon: arrLon };

  const directNm = haversineNM(departure, arrival);

  // Trivial / degenerate case: just return the direct great circle.
  if (directNm < 30) {
    const pts = greatCircle(departure, arrival, 24);
    const path = pts.map((p) => [p.lat, wrapLon(p.lon)] as [number, number]);
    return scoreFinalPath(path, baseFuelPerNm, weatherWeight, avoidConstraints);
  }

  // Search box around the direct track, with margin to allow detours.
  const latSpan = Math.abs(arr.lat - dep.lat);
  const lonSpan = Math.abs(arr.lon - dep.lon);
  const margin =
    gridMarginDeg ?? Math.min(28, Math.max(6, 0.4 * Math.max(latSpan, lonSpan)));
  const latMin = Math.max(-85, Math.min(dep.lat, arr.lat) - margin);
  const latMax = Math.min(85, Math.max(dep.lat, arr.lat) + margin);
  const lonMin = Math.min(dep.lon, arr.lon) - margin;
  const lonMax = Math.max(dep.lon, arr.lon) + margin;

  // Choose a cell size that keeps the node count under `maxNodes`.
  const latRange = latMax - latMin;
  const lonRange = lonMax - lonMin;
  let cell = Math.max(0.12, Math.sqrt((latRange * lonRange) / maxNodes));
  let nLat = Math.max(2, Math.round(latRange / cell) + 1);
  let nLon = Math.max(2, Math.round(lonRange / cell) + 1);
  while (nLat * nLon > maxNodes) {
    cell *= 1.15;
    nLat = Math.max(2, Math.round(latRange / cell) + 1);
    nLon = Math.max(2, Math.round(lonRange / cell) + 1);
  }
  const cellLat = latRange / (nLat - 1);
  const cellLon = lonRange / (nLon - 1);

  const nodeCount = nLat * nLon;
  const nodeLat = (i: number) => latMin + i * cellLat;
  const nodeLon = (j: number) => lonMin + j * cellLon;
  const idOf = (i: number, j: number) => i * nLon + j;

  // Pre-filter the area constraints to those overlapping the search box (in
  // wrapped-lon terms). If the box straddles the antimeridian, keep them all.
  let activeConstraints = PREPPED_CONSTRAINTS;
  if (avoidConstraints) {
    const wrapMin = wrapLon(lonMin);
    const wrapMax = wrapLon(lonMax);
    const straddles = wrapMax < wrapMin || lonMax - lonMin >= 360;
    activeConstraints = PREPPED_CONSTRAINTS.filter((c) => {
      if (c.maxLat < latMin || c.minLat > latMax) return false;
      if (straddles) return true;
      return !(c.maxLon < wrapMin || c.minLon > wrapMax);
    });
  }

  // Per-node cost cache: cost-per-NM to *be* at that node, in fuel-tonne
  // equivalents. Computed lazily and memoised. -1 = not yet computed.
  const perNm = new Float64Array(nodeCount).fill(-1);
  const minFuelPerNm = baseFuelPerNm; // admissible heuristic lower bound

  // Keep the track a cell or so offshore: cells that are not land themselves
  // but sit next to land get a moderate penalty, so the route prefers the
  // middle of a channel instead of hugging (and clipping) the coastline.
  const coastBufferDeg = Math.max(cellLat, cellLon) * 1.1;

  const costPerNmAt = (id: number): number => {
    const cached = perNm[id];
    if (cached >= 0) return cached;
    const i = Math.floor(id / nLon);
    const j = id - i * nLon;
    const lat = nodeLat(i);
    const lon = wrapLon(nodeLon(j));
    const env = sampleEnvironment(lat, lon);
    const fuelPerNm = baseFuelPerNm * (1 + (hazardAware ? weatherResistance(env) : 0));
    const heavy = hazardAware ? heavyWeatherPenalty(env) : 0;
    const iceCost = hazardAware && env.iceRisk > 0.15 ? env.iceRisk * 2500 : 0;
    const cycloneCost = hazardAware && env.cycloneRisk > 0.2 ? env.cycloneRisk * 1800 : 0;
    const area = avoidConstraints ? areaPenaltyAt(lat, lon, activeConstraints).penalty : 0;
    let land = 0;
    if (isLand(lat, lon)) {
      land = LAND_PENALTY_PER_NM;
    } else if (
      isLand(lat + coastBufferDeg, lon) ||
      isLand(lat - coastBufferDeg, lon) ||
      isLand(lat, lon + coastBufferDeg) ||
      isLand(lat, lon - coastBufferDeg)
    ) {
      land = COAST_BUFFER_PENALTY_PER_NM;
    }
    let avoid = 0;
    if (hasAvoid && land < LAND_PENALTY_PER_NM) {
      let nearest = Infinity;
      for (let k = 0; k < avoidPts.length; k += 1) {
        const p = avoidPts[k];
        const dLonA = ((lon - p.lon + 540) % 360) - 180;
        const d = Math.hypot(lat - p.lat, dLonA);
        if (d < nearest) {
          nearest = d;
          if (nearest === 0) break;
        }
      }
      if (nearest < avoidRadiusDeg) {
        avoid = avoidPenaltyPerNm * (1 - nearest / avoidRadiusDeg);
      }
    }
    const value =
      fuelPerNm * (1 + weatherWeight * heavy) + iceCost + cycloneCost + area + land + avoid;
    perNm[id] = value;
    return value;
  };

  // Snap endpoints to the nearest grid nodes.
  const snap = (p: LatLon): number => {
    const i = Math.round((p.lat - latMin) / cellLat);
    const j = Math.round((p.lon - lonMin) / cellLon);
    const ci = Math.max(0, Math.min(nLat - 1, i));
    const cj = Math.max(0, Math.min(nLon - 1, j));
    return idOf(ci, cj);
  };
  const startId = snap(dep);
  const goalId = snap(arr);

  // A* search.
  const gScore = new Float64Array(nodeCount).fill(Infinity);
  const cameFrom = new Int32Array(nodeCount).fill(-1);
  const closed = new Uint8Array(nodeCount);
  const open = new MinHeap();

  const goalI = Math.floor(goalId / nLon);
  const goalJ = goalId - goalI * nLon;
  const goalPos: LatLon = { lat: nodeLat(goalI), lon: nodeLon(goalJ) };
  const heuristic = (id: number): number => {
    const i = Math.floor(id / nLon);
    const j = id - i * nLon;
    return haversineNM({ lat: nodeLat(i), lon: nodeLon(j) }, goalPos) * minFuelPerNm;
  };

  gScore[startId] = 0;
  open.push(startId, heuristic(startId));

  const neighborOffsets = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ];

  let found = false;
  let guard = 0;
  const guardMax = nodeCount * 9 + 1000;
  while (open.size > 0 && guard < guardMax) {
    guard += 1;
    const current = open.pop();
    if (current === goalId) {
      found = true;
      break;
    }
    if (closed[current]) continue;
    closed[current] = 1;

    const ci = Math.floor(current / nLon);
    const cj = current - ci * nLon;
    const curLat = nodeLat(ci);
    const curLon = nodeLon(cj);
    const curCostPerNm = costPerNmAt(current);

    for (const [di, dj] of neighborOffsets) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || ni >= nLat || nj < 0 || nj >= nLon) continue;
      const nid = idOf(ni, nj);
      if (closed[nid]) continue;
      const nLatV = nodeLat(ni);
      const nLonV = nodeLon(nj);
      const legNm = haversineNM({ lat: curLat, lon: curLon }, { lat: nLatV, lon: nLonV });
      const avgPerNm = (curCostPerNm + costPerNmAt(nid)) / 2;
      const tentative = gScore[current] + legNm * avgPerNm;
      if (tentative < gScore[nid]) {
        gScore[nid] = tentative;
        cameFrom[nid] = current;
        open.push(nid, tentative + heuristic(nid));
      }
    }
  }

  if (!found) {
    // Should not happen with soft costs, but fall back to the great circle.
    const pts = greatCircle(departure, arrival, 48);
    const path = pts.map((p) => [p.lat, wrapLon(p.lon)] as [number, number]);
    return scoreFinalPath(path, baseFuelPerNm, weatherWeight, avoidConstraints);
  }

  // Reconstruct the node path.
  const nodePath: number[] = [];
  for (let id = goalId; id !== -1; id = cameFrom[id]) nodePath.push(id);
  nodePath.reverse();

  // Convert to coordinates, exact endpoints first/last, and simplify.
  const coords: Array<[number, number]> = [[departure.lat, departure.lon]];
  for (const id of nodePath) {
    const i = Math.floor(id / nLon);
    const j = id - i * nLon;
    coords.push([nodeLat(i), wrapLon(nodeLon(j))]);
  }
  coords.push([arrival.lat, arrival.lon]);

  // Smooth the jagged grid path into the longest great-circle arcs that stay
  // clear of land and hard zones ("string pulling"), so open water is crossed
  // on a proper great circle instead of a stair-stepped straight line.
  const smoothed = greatCircleStringPull(coords, activeConstraints, avoidConstraints);

  // Final safety pass: nudge any segment that still grazes a coastline (in a
  // narrow strait or approach channel) offshore with a clear via-point.
  const repaired = repairLandClips(smoothed, activeConstraints, avoidConstraints);

  return scoreFinalPath(repaired, baseFuelPerNm, weatherWeight, avoidConstraints);
}

/**
 * Route from `departure` to `arrival` while being forced through an
 * intermediate `via` point. Each leg is optimized independently (so both stay
 * clear of land and hazards) and the two tracks are stitched together, then
 * re-scored as a whole. Used to offer alternative corridors (e.g. a more
 * northern or southern path) that visibly differ from the direct optimum.
 */
export function findRouteVia(
  departure: LatLon,
  arrival: LatLon,
  via: LatLon,
  options: OptimizeOptions = {},
): OptimizedRoute {
  const legA = findBestOptimizedRoute(departure, via, options);
  const legB = findBestOptimizedRoute(via, arrival, options);
  const path = [...legA.path, ...legB.path.slice(1)];
  const {
    baseFuelPerNm = 0.1,
    weatherWeight = 40,
    avoidConstraints = true,
  } = options;
  return scoreFinalPath(path, baseFuelPerNm, weatherWeight, avoidConstraints);
}

/**
 * True if the great-circle arc between `a` and `b` stays clear of land and any
 * hard area constraint (sampled ~every 60 NM along the actual arc).
 */
function arcIsClear(
  a: LatLon,
  b: LatLon,
  activeConstraints: PreppedConstraint[],
  avoidConstraints: boolean,
): boolean {
  const distNm = haversineNM(a, b);
  const segs = Math.max(2, Math.ceil(distNm / 6));
  const pts = greatCircle(a, b, segs);
  for (const p of pts) {
    const lo = wrapLon(p.lon);
    if (isLand(p.lat, lo)) return false;
    if (avoidConstraints && areaPenaltyAt(p.lat, lo, activeConstraints).hardObstacle) {
      return false;
    }
  }
  return true;
}

/**
 * Replace a dense, jagged node path with a minimal sequence of great-circle
 * arcs. From each kept point we reach for the farthest subsequent point whose
 * connecting great circle is clear of obstacles, then emit that arc as
 * curved samples. Near coastlines this steps point-by-point; across open ocean
 * it collapses into a single long great circle.
 */
function greatCircleStringPull(
  coords: Array<[number, number]>,
  activeConstraints: PreppedConstraint[],
  avoidConstraints: boolean,
): Array<[number, number]> {
  if (coords.length <= 2) return coords;
  const out: Array<[number, number]> = [coords[0]];
  const maxJump = 80; // cap look-ahead so the visibility search stays bounded
  let i = 0;
  while (i < coords.length - 1) {
    const a: LatLon = { lat: coords[i][0], lon: coords[i][1] };
    let j = Math.min(coords.length - 1, i + maxJump);
    while (j > i + 1) {
      const b: LatLon = { lat: coords[j][0], lon: coords[j][1] };
      if (arcIsClear(a, b, activeConstraints, avoidConstraints)) break;
      j -= 1;
    }
    const b: LatLon = { lat: coords[j][0], lon: coords[j][1] };
    const distNm = haversineNM(a, b);
    const segs = Math.max(1, Math.ceil(distNm / 120));
    const arc = greatCircle(a, b, segs);
    for (let k = 1; k < arc.length; k += 1) {
      out.push([arc[k].lat, wrapLon(arc[k].lon)]);
    }
    i = j;
  }
  return out;
}

/**
 * Search for a single via-point that lets the leg `a → b` reach open water,
 * by offsetting the leg's midpoint perpendicular to the leg (both sides, in
 * growing steps). Returns the first via whose two half-legs are both clear, or
 * `null` if none is found within reach.
 */
function findClearVia(
  a: LatLon,
  b: LatLon,
  activeConstraints: PreppedConstraint[],
  avoidConstraints: boolean,
): LatLon | null {
  const mLat = (a.lat + b.lat) / 2;
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const mLon = a.lon + dLon / 2;
  const dLat = b.lat - a.lat;
  const len = Math.hypot(dLat, dLon) || 1e-9;
  const perpLat = -dLon / len;
  const perpLon = dLat / len;
  for (let off = 0.3; off <= 3.0; off += 0.3) {
    for (const sign of [1, -1]) {
      const via: LatLon = {
        lat: mLat + perpLat * off * sign,
        lon: mLon + perpLon * off * sign,
      };
      if (via.lat > 85 || via.lat < -85) continue;
      if (
        arcIsClear(a, via, activeConstraints, avoidConstraints) &&
        arcIsClear(via, b, activeConstraints, avoidConstraints)
      ) {
        return via;
      }
    }
  }
  return null;
}

/**
 * Walk the smoothed path and, wherever a leg still crosses land or a hard zone,
 * insert an offshore via-point so the drawn track stays off the coast. Legs
 * that start or end on land (the coastal ports themselves) are left as-is.
 */
function repairLandClips(
  path: Array<[number, number]>,
  activeConstraints: PreppedConstraint[],
  avoidConstraints: boolean,
): Array<[number, number]> {
  if (path.length < 2) return path;
  const out: Array<[number, number]> = [path[0]];
  for (let i = 1; i < path.length; i += 1) {
    const a: LatLon = { lat: out[out.length - 1][0], lon: out[out.length - 1][1] };
    const b: LatLon = { lat: path[i][0], lon: path[i][1] };
    if (!arcIsClear(a, b, activeConstraints, avoidConstraints)) {
      const via = findClearVia(a, b, activeConstraints, avoidConstraints);
      if (via) out.push([via.lat, wrapLon(via.lon)]);
    }
    out.push(path[i]);
  }
  return out;
}

/** Compute distance, fuel, weather penalty and hazard flags for a final path. */
function scoreFinalPath(
  path: Array<[number, number]>,
  baseFuelPerNm: number,
  weatherWeight: number,
  avoidConstraints: boolean,
): OptimizedRoute {
  let distanceNm = 0;
  let fuelTons = 0;
  let cost = 0;
  let weatherSum = 0;
  let weatherSamples = 0;
  const hazards: RouteHazards = {
    land: false,
    areaConstraints: false,
    heavyWeather: false,
    ice: false,
    cyclone: false,
  };

  const sampleAt = (lat: number, lon: number) => {
    const env = sampleEnvironment(lat, lon);
    const heavy = heavyWeatherPenalty(env);
    weatherSum += heavy;
    weatherSamples += 1;
    if (heavy > 0.5) hazards.heavyWeather = true;
    if (env.iceRisk > 0.3) hazards.ice = true;
    if (env.cycloneRisk > 0.35) hazards.cyclone = true;
    let area = 0;
    if (avoidConstraints) {
      const hit = areaPenaltyAt(lat, wrapLon(lon), PREPPED_CONSTRAINTS);
      area = hit.penalty;
      if (hit.penalty > 0) hazards.areaConstraints = true;
    }
    if (isLand(lat, wrapLon(lon))) hazards.land = true;
    const fuelPerNm = baseFuelPerNm * (1 + weatherResistance(env));
    return {
      fuelPerNm,
      costPerNm:
        fuelPerNm * (1 + weatherWeight * heavy) +
        (env.iceRisk > 0.15 ? env.iceRisk * 2500 : 0) +
        (env.cycloneRisk > 0.2 ? env.cycloneRisk * 1800 : 0) +
        area,
    };
  };

  let prevSample = sampleAt(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i += 1) {
    const a = { lat: path[i - 1][0], lon: path[i - 1][1] };
    const b = { lat: path[i][0], lon: path[i][1] };
    const legNm = haversineNM(a, b);
    const curSample = sampleAt(b.lat, b.lon);
    const avgFuelPerNm = (prevSample.fuelPerNm + curSample.fuelPerNm) / 2;
    const avgCostPerNm = (prevSample.costPerNm + curSample.costPerNm) / 2;
    distanceNm += legNm;
    fuelTons += legNm * avgFuelPerNm;
    cost += legNm * avgCostPerNm;
    prevSample = curSample;
  }

  return {
    path,
    distanceNm,
    fuelTons,
    cost,
    weatherPenalty: weatherSamples > 0 ? weatherSum / weatherSamples : 0,
    hazards,
  };
}
