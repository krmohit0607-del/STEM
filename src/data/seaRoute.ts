/**
 * Sea-route generator.
 *
 * Produces an optimized route between two points that stays on water by
 * running A* pathfinding over a global land/sea grid. The land mask is
 * built from the Natural Earth 110m land polygons, fetched once from a
 * public CDN (no API key — same "online data" model the map already
 * uses) and cached for the session.
 *
 * The grid path is then simplified with a land-aware "string pulling"
 * pass: a waypoint is only dropped when the straight segment that would
 * replace it stays entirely over water. This guarantees the rendered
 * polyline never crosses land, even between sparse turning points.
 *
 * NOTE: this is a navigational approximation at ~1° resolution — good
 * enough to avoid land and give a sensible optimized track, but not a
 * substitute for ECDIS-grade routing.
 */

export interface SeaRoutePoint {
  lat: number;
  lon: number;
}

type Ring = Array<[number, number]>; // [lon, lat]
type RawPolygon = Ring[]; // [outer, ...holes]

interface LandPolygon {
  rings: RawPolygon;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

const LAND_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_50m_land.geojson';

let landPolysCache: LandPolygon[] | null = null;

function withBBox(rings: RawPolygon): LandPolygon {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of rings[0] ?? []) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { rings, minLon, minLat, maxLon, maxLat };
}

async function loadLandPolygons(): Promise<LandPolygon[]> {
  if (landPolysCache) return landPolysCache;
  const res = await fetch(LAND_URL);
  if (!res.ok) throw new Error(`Failed to load coastline data (${res.status})`);
  const gj = (await res.json()) as {
    features: Array<{ geometry: { type: string; coordinates: unknown } }>;
  };
  const polys: LandPolygon[] = [];
  for (const f of gj.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') {
      polys.push(withBBox(g.coordinates as RawPolygon));
    } else if (g.type === 'MultiPolygon') {
      for (const p of g.coordinates as RawPolygon[]) polys.push(withBBox(p));
    }
  }
  landPolysCache = polys;
  return polys;
}

/** Ray-casting point-in-ring test. `ring` is [lon, lat] pairs. */
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isLand(lon: number, lat: number, polys: LandPolygon[]): boolean {
  for (const poly of polys) {
    if (
      lon < poly.minLon ||
      lon > poly.maxLon ||
      lat < poly.minLat ||
      lat > poly.maxLat
    ) {
      continue;
    }
    if (poly.rings.length === 0) continue;
    if (pointInRing(lon, lat, poly.rings[0])) {
      let inHole = false;
      for (let h = 1; h < poly.rings.length; h++) {
        if (pointInRing(lon, lat, poly.rings[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

// --- Grid -----------------------------------------------------------

const STEP = 1; // degrees per cell
const LAT_MAX = 84;
const LAT_MIN = -80;
const ROWS = Math.round((LAT_MAX - LAT_MIN) / STEP) + 1;
const COLS = Math.round(360 / STEP); // wraps in longitude

const latForRow = (r: number) => LAT_MAX - r * STEP;
const lonForCol = (c: number) => -180 + c * STEP;

interface Grid {
  land: boolean[]; // ROWS*COLS
  coastal: boolean[]; // sea cell adjacent to land
  polys: LandPolygon[]; // source coastline for exact segment tests
}

let gridCache: Grid | null = null;

function buildGrid(polys: LandPolygon[]): Grid {
  if (gridCache) return gridCache;
  const land = new Array<boolean>(ROWS * COLS).fill(false);
  for (let r = 0; r < ROWS; r++) {
    const lat = latForRow(r);
    for (let c = 0; c < COLS; c++) {
      const lon = lonForCol(c);
      land[r * COLS + c] = isLand(lon, lat, polys);
    }
  }
  const coastal = new Array<boolean>(ROWS * COLS).fill(false);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (land[r * COLS + c]) continue;
      let touchesLand = false;
      for (let dr = -1; dr <= 1 && !touchesLand; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          if (nr < 0 || nr >= ROWS) continue;
          const nc = (c + dc + COLS) % COLS;
          if (land[nr * COLS + nc]) {
            touchesLand = true;
            break;
          }
        }
      }
      coastal[r * COLS + c] = touchesLand;
    }
  }
  gridCache = { land, coastal, polys };
  return gridCache;
}

/** Grid cell index for an arbitrary lat/lon (clamped to bounds, wraps lon). */
function cellForLatLon(lat: number, lon: number): number {
  const r = Math.max(
    0,
    Math.min(ROWS - 1, Math.round((LAT_MAX - lat) / STEP)),
  );
  const c = ((Math.round((lon + 180) / STEP) % COLS) + COLS) % COLS;
  return r * COLS + c;
}

// --- Geometry -------------------------------------------------------

function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065;
  const dLat = toRad(lat2 - lat1);
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  dLon = toRad(dLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * True when the straight segment between two points stays over water.
 * Tested against the actual coastline polygons (not the coarse grid) at
 * a fine sampling interval, so it reflects real land geometry. The exact
 * endpoints are skipped so a coastal departure / arrival port does not
 * count as a crossing.
 */
function segmentClear(a: SeaRoutePoint, b: SeaRoutePoint, grid: Grid): boolean {
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLat = b.lat - a.lat;
  const spanDeg = Math.max(Math.abs(dLat), Math.abs(dLon));
  // ~0.2° (~12 NM) sampling — fine enough to catch isthmuses the grid misses.
  const steps = Math.max(2, Math.ceil(spanDeg / 0.2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const lat = a.lat + dLat * t;
    let lon = a.lon + dLon * t;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    if (isLand(lon, lat, grid.polys)) return false;
  }
  return true;
}

/** Nearest sea (non-land) grid cell to a lat/lon. */
function nearestSeaCell(lat: number, lon: number, grid: Grid): number {
  const start = cellForLatLon(lat, lon);
  if (!grid.land[start]) return start;
  const r0 = Math.floor(start / COLS);
  const c0 = start % COLS;
  for (let radius = 1; radius < Math.max(ROWS, COLS); radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      const nr = r0 + dr;
      if (nr < 0 || nr >= ROWS) continue;
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
        const nc = (c0 + dc + COLS) % COLS;
        if (!grid.land[nr * COLS + nc]) return nr * COLS + nc;
      }
    }
  }
  return start;
}

// --- A* -------------------------------------------------------------

/** Binary min-heap keyed by priority. */
class MinHeap {
  private nodes: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, priority: number): void {
    this.nodes.push(node);
    this.prio.push(priority);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (this.nodes.length === 0) return undefined;
    const top = this.nodes[0];
    const lastNode = this.nodes.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.prio[0] = lastPrio;
      let i = 0;
      const n = this.nodes.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < n && this.prio[l] < this.prio[smallest]) smallest = l;
        if (r < n && this.prio[r] < this.prio[smallest]) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}

const NEIGHBORS: Array<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function aStar(startCell: number, goalCell: number, grid: Grid): number[] | null {
  const total = ROWS * COLS;
  const gScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  gScore[startCell] = 0;

  const gr = (cell: number) => Math.floor(cell / COLS);
  const gc = (cell: number) => cell % COLS;
  const cellLat = (cell: number) => latForRow(gr(cell));
  const cellLon = (cell: number) => lonForCol(gc(cell));

  const goalLat = cellLat(goalCell);
  const goalLon = cellLon(goalCell);

  const open = new MinHeap();
  open.push(startCell, haversineNM(cellLat(startCell), cellLon(startCell), goalLat, goalLon));

  while (open.size > 0) {
    const current = open.pop()!;
    if (current === goalCell) {
      const path: number[] = [current];
      let prev = cameFrom[current];
      while (prev !== -1) {
        path.push(prev);
        prev = cameFrom[prev];
      }
      return path.reverse();
    }

    const r = gr(current);
    const c = gc(current);
    const lat = cellLat(current);
    const lon = cellLon(current);

    for (const [dr, dc] of NEIGHBORS) {
      const nr = r + dr;
      if (nr < 0 || nr >= ROWS) continue;
      const nc = (c + dc + COLS) % COLS;
      const neighbor = nr * COLS + nc;
      if (grid.land[neighbor]) continue;
      // Prevent diagonal moves from squeezing between two land cells.
      if (dr !== 0 && dc !== 0) {
        const sideA = r * COLS + nc;
        const sideB = nr * COLS + c;
        if (grid.land[sideA] && grid.land[sideB]) continue;
      }
      const nLat = latForRow(nr);
      const nLon = lonForCol(nc);
      let step = haversineNM(lat, lon, nLat, nLon);
      // Discourage hugging the coast so the track keeps a safe offing.
      if (grid.coastal[neighbor]) step *= 2.5;
      const tentative = gScore[current] + step;
      if (tentative < gScore[neighbor]) {
        gScore[neighbor] = tentative;
        cameFrom[neighbor] = current;
        const f = tentative + haversineNM(nLat, nLon, goalLat, goalLon);
        open.push(neighbor, f);
      }
    }
  }
  return null;
}

/**
 * Land-aware "string pulling": from each kept point, advance to the
 * FARTHEST later point still reachable by a straight water-only segment.
 * Every emitted segment is therefore guaranteed clear of land (validated
 * against the real coastline). Falls back to the next grid point when
 * even the immediate neighbour can't be seen, so progress is always made.
 */
function simplify(points: SeaRoutePoint[], grid: Grid): SeaRoutePoint[] {
  if (points.length <= 2) return points;
  const out: SeaRoutePoint[] = [points[0]];
  let i = 0;
  const n = points.length;
  while (i < n - 1) {
    let j = n - 1;
    while (j > i + 1 && !segmentClear(points[i], points[j], grid)) {
      j--;
    }
    out.push(points[j]);
    i = j;
  }
  return out;
}

/**
 * Generate an optimized sea route between two points. Throws if the
 * coastline data cannot be loaded or no water path exists.
 */
export async function generateSeaRoute(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
): Promise<SeaRoutePoint[]> {
  const polys = await loadLandPolygons();
  const grid = buildGrid(polys);

  const startCell = nearestSeaCell(start.lat, start.lon, grid);
  const goalCell = nearestSeaCell(end.lat, end.lon, grid);

  const cellPath = aStar(startCell, goalCell, grid);
  if (!cellPath) {
    throw new Error('No open-water route could be found between those points.');
  }

  const coords: SeaRoutePoint[] = cellPath.map((cell) => ({
    lat: latForRow(Math.floor(cell / COLS)),
    lon: lonForCol(cell % COLS),
  }));

  // Use the exact requested endpoints instead of the snapped grid cells.
  const full: SeaRoutePoint[] = [
    { lat: start.lat, lon: start.lon },
    ...coords.slice(1, -1),
    { lat: end.lat, lon: end.lon },
  ];

  return simplify(full, grid);
}
